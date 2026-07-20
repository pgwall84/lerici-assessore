import * as cheerio from "cheerio";
import type { BandoRaw, RisultatoFonte } from "./types";
import { estraiBatch } from "../estrazione-ai";

const FONTE_URL = "https://www.x-desk.it/infobandi/";
const ENTE = "x-desk Info Bandi";

export async function parseXdeskInfobandi(): Promise<RisultatoFonte> {
  const res = await fetch(FONTE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`x-desk Info Bandi: HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Individuazione dei candidati (invariata): riga tabella strutturata, 7 colonne fisse per
  // posizione. Il testo di ogni riga viene passato per intero all'estrazione AI al posto delle
  // regex che prima ricavavano titolo/dotazione/ambito da ciascuna colonna singolarmente — solo
  // l'URL del bando resta letto direttamente (non è un dato da "interpretare").
  const candidati: Array<{ bandoUrl?: string; testo: string }> = [];
  $("table tr").each((_, row) => {
    const tds = $(row).find("td");
    if (tds.length !== 7) return; // salta header (<th>) e righe spurie

    // TD[0] = colore (marker), TD[1] = Titolo, TD[2] = Area, TD[3] = Link, TD[4] = Descrizione, TD[5] = Scadenza, TD[6] = Ambito
    const titoloRaw = tds.eq(1).text().trim();
    if (!titoloRaw || titoloRaw === "Titolo") return; // salta riga intestazione
    if (titoloRaw.length < 5) return;

    const bandoUrl = tds.eq(3).find("a").attr("href")?.trim()
      || tds.eq(3).text().trim()
      || undefined;

    const testo = [
      `Titolo: ${titoloRaw}`,
      `Area tematica: ${tds.eq(2).text().trim()}`,
      `Descrizione: ${tds.eq(4).text().trim()}`,
      `Scadenza: ${tds.eq(5).text().trim()}`,
      `Ambito: ${tds.eq(6).text().trim()}`,
    ].join("\n");

    candidati.push({ bandoUrl, testo });
  });

  if (candidati.length === 0) {
    throw new Error("x-desk Info Bandi: nessun bando estratto (possibile cambio struttura HTML)");
  }

  const { risultati, estratti, nonBando, falliti } = await estraiBatch(candidati, ENTE);

  const bandi: BandoRaw[] = risultati.map(({ candidato, campi }) => ({
    titolo: campi.titolo,
    ente: ENTE,
    fonteUrl: FONTE_URL,
    bandoUrl: candidato.bandoUrl,
    descrizione: campi.descrizione,
    dotazione: campi.dotazione,
    beneficiari: campi.beneficiari,
    dataChiusura: campi.dataChiusura ? new Date(campi.dataChiusura) : undefined,
    ambitoTerritoriale: campi.ambitoTerritoriale,
    sogliaPopolazione: campi.sogliaPopolazione,
    tipoBeneficiario: campi.tipoBeneficiario,
  }));

  return { bandi, candidati: candidati.length, estratti, nonBando, falliti };
}
