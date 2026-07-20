import { prisma } from "@/lib/prisma";
import { parseConferenzaStatoCitta } from "./fonti/conferenza-stato-citta";
import { parseXdeskInfobandi } from "./fonti/xdesk-infobandi";
import { parseAnciLiguria } from "./fonti/anci-liguria";
import { parseUpel } from "./fonti/upel";
import { calcolaHash } from "./dedup";
import { isBandoRilevante } from "./filtro-territoriale";
import { inviaBandiTelegram, inviaSegnalazioneRottura } from "./notifica";
import type { BandoRaw } from "./fonti/types";
import type { Delega } from "@prisma/client";

// Keyword mapping per assegnare delega euristica
const KEYWORD_DELEGA: Array<{ keywords: string[]; delega: Delega }> = [
  { keywords: ["viabilit", "strad", "asfalto", "marciapiede", "traffico"], delega: "VIABILITA" },
  { keywords: ["ambient", "verde", "natura", "ecolog", "sostenib", "inquinam"], delega: "AMBIENTE" },
  { keywords: ["rifiut", "raccolta differenz", "compost", "smaltiment"], delega: "RIFIUTI" },
  { keywords: ["idric", "acquedotto", "fognatura", "depurazione", "acqua"], delega: "SISTEMA_IDRICO" },
  { keywords: ["illumin", "luce pubblica", "led", "lampion"], delega: "ILLUMINAZIONE" },
  { keywords: ["accessib", "barriere architetton", "disabil", "mobilità ridotta"], delega: "ACCESSIBILITA" },
  { keywords: ["cimiter", "sepoltura", "loculi"], delega: "CIMITERI" },
  { keywords: ["abitativ", "edilizia residenzial", "casa", "alloggi", "social housing"], delega: "POLITICHE_ABITATIVE" },
  { keywords: ["digital", "informatica", "pnrr digitale", "banda larga", "pa digitale", "cloud"], delega: "DIGITALIZZAZIONE" },
  { keywords: ["manutenzione", "patrimonio", "immobil", "edifici comunali"], delega: "MANUTENZIONE_PATRIMONIO" },
];

function rilevaDelegaEuristica(b: BandoRaw): Delega | undefined {
  const testo = `${b.titolo} ${b.descrizione ?? ""} ${b.beneficiari ?? ""}`.toLowerCase();
  for (const { keywords, delega } of KEYWORD_DELEGA) {
    if (keywords.some(k => testo.includes(k))) return delega;
  }
  return undefined;
}

type FonteConfig = {
  nome: string;
  fn: () => Promise<BandoRaw[]>;
};

const FONTI: FonteConfig[] = [
  { nome: "Conferenza Stato-Città", fn: parseConferenzaStatoCitta },
  { nome: "x-desk Info Bandi", fn: parseXdeskInfobandi },
  { nome: "ANCI Liguria", fn: parseAnciLiguria },
  { nome: "UPEL", fn: parseUpel },
  // ANCI Nazionale disattivata temporaneamente (2026-07-20): la spec prevedeva di aggiungerla solo
  // dopo aver validato parser+dedup+notifica sulle 4 fonti prioritarie sopra, non da subito insieme
  // a loro. È anche la fonte più rumorosa (mescola webinar/eventi ai bandi veri) e la più lenta
  // (~13s). Riattivare importando parseAnciNazionale da "./fonti/anci-nazionale" quando le altre 4
  // sono stabili e verificate.
];

export async function checkBandi(): Promise<{ nuovi: number; errori: string[] }> {
  const errori: string[] = [];
  const tuttiNuovi: BandoRaw[] = [];

  for (const fonte of FONTI) {
    try {
      const risultati = await fonte.fn();

      if (risultati.length === 0) {
        // Controlla se anche la run precedente era vuota (2 run consecutive)
        const ultimiDueGiorni = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
        const recenti = await prisma.bando.count({
          where: { ente: { contains: fonte.nome.split(" ")[0] }, createdAt: { gte: ultimiDueGiorni } },
        });
        if (recenti === 0) {
          await inviaSegnalazioneRottura(fonte.nome);
        }
        continue;
      }

      for (const raw of risultati) {
        if (raw.dataChiusura && raw.dataChiusura < new Date()) continue;
        if (!isBandoRilevante(raw)) continue;

        const hash = calcolaHash(raw);

        const esiste = await prisma.bando.findUnique({ where: { hashContenuto: hash } });
        if (esiste) continue;

        const delega = rilevaDelegaEuristica(raw);
        await prisma.bando.create({
          data: {
            titolo: raw.titolo.slice(0, 250),
            ente: raw.ente,
            fonteUrl: raw.fonteUrl,
            bandoUrl: raw.bandoUrl,
            descrizione: raw.descrizione?.slice(0, 1000),
            dotazione: raw.dotazione?.slice(0, 200),
            beneficiari: raw.beneficiari?.slice(0, 300),
            dataApertura: raw.dataApertura,
            dataChiusura: raw.dataChiusura,
            delega: delega ?? null,
            hashContenuto: hash,
          },
        });
        tuttiNuovi.push(raw);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errori.push(`${fonte.nome}: ${msg}`);
    }
  }

  // Notifica Telegram per i bandi appena inseriti (non ancora notificati)
  const daNotificare = await prisma.bando.findMany({
    where: { notificato: false },
    orderBy: { createdAt: "asc" },
  });
  if (daNotificare.length > 0) {
    try {
      await inviaBandiTelegram(daNotificare);
      await prisma.bando.updateMany({
        where: { id: { in: daNotificare.map(b => b.id) } },
        data: { notificato: true },
      });
    } catch (err) {
      errori.push(`Telegram: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Segna come SCADUTO i bandi con dataChiusura passata ancora NUOVO/VALUTATO/INTERESSANTE
  await prisma.bando.updateMany({
    where: {
      dataChiusura: { lt: new Date() },
      stato: { in: ["NUOVO", "VALUTATO", "INTERESSANTE"] },
    },
    data: { stato: "SCADUTO" },
  });

  return { nuovi: tuttiNuovi.length, errori };
}
