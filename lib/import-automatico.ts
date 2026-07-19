import { prisma } from "@/lib/prisma";
import { getMailsPerEtichetta, marcaImportata } from "@/lib/gmail";
import { contentTypeDaNomeFile, estraiTestoDaFile, estraiVociZip, trovaOdgInZip } from "@/lib/estrazione-documenti";
import { riformattaOdg } from "@/lib/claude";
import { supabase } from "@/lib/supabase";
import type { TipoAtto } from "@prisma/client";

const BUCKET = "foto";

export type RisultatoImport = { creati: number; ambigui: number; errori: string[] };

function sommaRisultati(risultati: RisultatoImport[]): RisultatoImport {
  return risultati.reduce(
    (acc, r) => ({ creati: acc.creati + r.creati, ambigui: acc.ambigui + r.ambigui, errori: [...acc.errori, ...r.errori] }),
    { creati: 0, ambigui: 0, errori: [] as string[] },
  );
}

async function caricaFile(cartella: string, buffer: Buffer, nomeFile: string): Promise<string> {
  const ext = nomeFile.includes(".") ? nomeFile.split(".").pop() : "bin";
  const filename = `${cartella}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
    contentType: contentTypeDaNomeFile(nomeFile),
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return publicUrl;
}

// Non deve mai far fallire l'import della mail: un errore qui (es. chiave Claude non
// configurata) lascia semplicemente odgTestoEstratto vuoto, riprovabile a mano dalla scheda.
async function provaEstraiOdg(attoId: string, buffer: Buffer, nomeFile: string) {
  try {
    const testo = await estraiTestoDaFile(buffer, nomeFile);
    if (!testo) return;
    const punti = await riformattaOdg(testo);
    if (punti.length === 0) return;
    await prisma.attoPoliticoAmministrativo.update({
      where: { id: attoId },
      data: { odgTestoEstratto: punti.map(p => `- ${p}`).join("\n") },
    });
  } catch {
    // ignorato di proposito — vedi commento sopra
  }
}

async function trovaProssimoConsiglio(daData: Date) {
  return prisma.attoPoliticoAmministrativo.findFirst({
    where: { tipo: "CONVOCAZIONE_CONSIGLIO", dataSeduta: { gte: daData } },
    orderBy: { dataSeduta: "asc" },
  });
}

/** Convocazioni Giunta/Consiglio/Commissioni: crea l'atto, carica gli allegati, prova l'estrazione ODG. */
async function importaConvocazione(nomeEtichetta: string, tipo: TipoAtto): Promise<RisultatoImport> {
  const mails = await getMailsPerEtichetta(nomeEtichetta);
  const risultato: RisultatoImport = { creati: 0, ambigui: 0, errori: [] };

  for (const m of mails) {
    try {
      const atto = await prisma.attoPoliticoAmministrativo.create({
        data: { tipo, oggetto: m.titolo, messageId: m.messageId },
      });

      for (const a of m.allegati) {
        if (a.filename.toLowerCase().endsWith(".zip")) {
          const voci = estraiVociZip(a.buffer);
          const indiceOdg = trovaOdgInZip(voci);
          for (let i = 0; i < voci.length; i++) {
            const url = await caricaFile(`atto-${atto.id}`, voci[i].buffer, voci[i].nomeFile);
            await prisma.documentoAtto.create({
              data: { attoId: atto.id, nomeFile: voci[i].nomeFile, storageUrl: url, ruolo: i === indiceOdg ? "ORDINE_GIORNO" : "PRATICA_ALLEGATA" },
            });
          }
          if (indiceOdg !== null) await provaEstraiOdg(atto.id, voci[indiceOdg].buffer, voci[indiceOdg].nomeFile);
          else risultato.ambigui++;
        } else {
          const url = await caricaFile(`atto-${atto.id}`, a.buffer, a.filename);
          await prisma.documentoAtto.create({
            data: { attoId: atto.id, nomeFile: a.filename, storageUrl: url, ruolo: "ORDINE_GIORNO" },
          });
          await provaEstraiOdg(atto.id, a.buffer, a.filename);
        }
      }

      await marcaImportata(m.messageId);
      risultato.creati++;
    } catch (e) {
      risultato.errori.push(`${nomeEtichetta} — ${m.oggettoOriginale}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return risultato;
}

/** Mozioni/Interrogazioni: PDF singolo, nessuna estrazione ODG, tentativo di collegamento al Consiglio successivo. */
async function importaMozioneOInterrogazione(nomeEtichetta: string, tipo: TipoAtto): Promise<RisultatoImport> {
  const mails = await getMailsPerEtichetta(nomeEtichetta);
  const risultato: RisultatoImport = { creati: 0, ambigui: 0, errori: [] };

  for (const m of mails) {
    try {
      const consiglioCollegato = await trovaProssimoConsiglio(new Date());
      const atto = await prisma.attoPoliticoAmministrativo.create({
        data: { tipo, oggetto: m.titolo, messageId: m.messageId, consiglioCollegatoId: consiglioCollegato?.id },
      });
      for (const a of m.allegati) {
        const url = await caricaFile(`atto-${atto.id}`, a.buffer, a.filename);
        await prisma.documentoAtto.create({
          data: { attoId: atto.id, nomeFile: a.filename, storageUrl: url, ruolo: "PRATICA_ALLEGATA" },
        });
      }
      await marcaImportata(m.messageId);
      risultato.creati++;
    } catch (e) {
      risultato.errori.push(`${nomeEtichetta} — ${m.oggettoOriginale}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return risultato;
}

function estraiNumeroSeduta(testo: string): string | null {
  const m = testo.match(/n\.?\s*(\d+)/i);
  return m?.[1] ?? null;
}

/**
 * Verbali Giunta (etichetta "Giunta/Verbali"): si agganciano alla convocazione Giunta con lo
 * stesso numero di seduta estratto dall'oggetto (es. "n. 28"), non semplicemente alla più
 * recente non archiviata — altrimenti si rischia di archiviare la seduta sbagliata. Se il
 * numero non si trova o non corrisponde a nessuna convocazione, non si indovina: si crea
 * comunque una scheda minimale con solo il verbale, già archiviata (come da spec).
 */
async function importaVerbaliGiunta(): Promise<RisultatoImport> {
  const mails = await getMailsPerEtichetta("Giunta/Verbali");
  const risultato: RisultatoImport = { creati: 0, ambigui: 0, errori: [] };

  for (const m of mails) {
    try {
      const numeroSeduta = estraiNumeroSeduta(m.oggettoOriginale);
      const convocazione = numeroSeduta
        ? await prisma.attoPoliticoAmministrativo.findFirst({
            where: { tipo: "CONVOCAZIONE_GIUNTA", stato: { not: "ARCHIVIATO" }, oggetto: { contains: numeroSeduta } },
            orderBy: { createdAt: "desc" },
          })
        : null;

      const atto = convocazione ?? await prisma.attoPoliticoAmministrativo.create({
        data: { tipo: "CONVOCAZIONE_GIUNTA", oggetto: m.titolo, stato: "ARCHIVIATO", messageId: m.messageId },
      });
      if (convocazione) await prisma.attoPoliticoAmministrativo.update({ where: { id: atto.id }, data: { stato: "ARCHIVIATO" } });

      for (const a of m.allegati) {
        const url = await caricaFile(`atto-${atto.id}`, a.buffer, a.filename);
        await prisma.documentoAtto.create({
          data: { attoId: atto.id, nomeFile: a.filename, storageUrl: url, ruolo: "PRATICA_ALLEGATA" },
        });
      }
      if (!convocazione) risultato.ambigui++;

      await marcaImportata(m.messageId);
      risultato.creati++;
    } catch (e) {
      risultato.errori.push(`Giunta/Verbali — ${m.oggettoOriginale}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return risultato;
}

async function importaGiustifiche(): Promise<RisultatoImport> {
  const mails = await getMailsPerEtichetta("Giustifica");
  const risultato: RisultatoImport = { creati: 0, ambigui: 0, errori: [] };

  for (const m of mails) {
    try {
      const giustifica = await prisma.giustifica.create({
        data: { oggetto: m.titolo, ufficioMittente: m.nomeMittente || null, messageId: m.messageId },
      });
      for (const a of m.allegati) {
        const url = await caricaFile(`giustifica-${giustifica.id}`, a.buffer, a.filename);
        await prisma.documentoGiustifica.create({
          data: { giustificaId: giustifica.id, nomeFile: a.filename, storageUrl: url },
        });
      }
      await marcaImportata(m.messageId);
      risultato.creati++;
    } catch (e) {
      risultato.errori.push(`Giustifica — ${m.oggettoOriginale}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return risultato;
}

export async function eseguiImportazioneAutomatica() {
  const [consiglio, commissioni, interrogazioni, mozioni, convocazioniGiunta, verbaliGiunta, giustifiche] = await Promise.all([
    importaConvocazione("Consiglio Comunale", "CONVOCAZIONE_CONSIGLIO"),
    importaConvocazione("Consiglio Comunale/Commissioni", "CONVOCAZIONE_COMMISSIONE"),
    importaMozioneOInterrogazione("Consiglio Comunale/Interrogazioni", "INTERROGAZIONE"),
    importaMozioneOInterrogazione("Consiglio Comunale/Mozioni", "MOZIONE"),
    importaConvocazione("Giunta/Convocazioni", "CONVOCAZIONE_GIUNTA"),
    importaVerbaliGiunta(),
    importaGiustifiche(),
  ]);

  return {
    totale: sommaRisultati([consiglio, commissioni, interrogazioni, mozioni, convocazioniGiunta, verbaliGiunta, giustifiche]),
    dettaglio: { consiglio, commissioni, interrogazioni, mozioni, convocazioniGiunta, verbaliGiunta, giustifiche },
  };
}
