import { prisma } from "@/lib/prisma";
import type { MailImport } from "@/lib/gmail";
import { contentTypeDaNomeFile, estraiTestoDaFile, estraiVociZip, trovaOdgInZip } from "@/lib/estrazione-documenti";
import { riformattaOdg } from "@/lib/claude";
import { supabase } from "@/lib/supabase";
import type { TipoAtto } from "@prisma/client";

const BUCKET = "foto";

// Esito dell'esecuzione di una singola mail del binario Automatico (motore di scansione,
// sezione 6). A differenza del vecchio `RisultatoImport` (aggregato su un intero elenco), qui
// si esegue una mail alla volta perché il punto di ingresso è ora una riga MailProcessata, non
// più una query diretta a Gmail per etichetta.
export type EsitoEsecuzione =
  | { esito: "COMPLETATO"; entitaId: string }
  // ODG ambiguo nello zip: il sistema si ferma SOLO per questa mail, nessuna entità creata.
  // Dal cron non è risolvibile (nessun umano a cui chiedere): la riga resta IN_ATTESA e il resto
  // del binario automatico prosegue senza interruzioni. Dalla schermata di revisione (Sessione C)
  // `candidati` alimenta la scelta manuale di quale file è l'ordine del giorno.
  | { esito: "AMBIGUO"; candidati: { indice: number; nomeFile: string }[] }
  | { esito: "ERRORE"; errore: string };

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

// Non deve mai far fallire l'esecuzione: un errore qui (es. chiave Claude non
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

/**
 * Convocazioni Giunta/Consiglio/Commissioni: crea l'atto, carica gli allegati, prova l'estrazione ODG.
 * Gli allegati possono arrivare come un unico zip (Consiglio) o come piu' PDF separati nella stessa
 * mail: in entrambi i casi vanno trattati come UN unico insieme di candidati per l'euristica ODG,
 * altrimenti ogni PDF separato finirebbe marcato ORDINE_GIORNO a prescindere.
 *
 * Ambiguità (più candidati, nessun match univoco): tipico dello zip del Consiglio (10-30 file) — in
 * quel caso NON si crea nulla, si torna IN_ATTESA per la scelta manuale (sezione 6, eccezione nel
 * binario automatico). Con al più un solo candidato (tipico di Giunta/Commissioni, singolo file
 * senza zip) non c'è invece nulla da disambiguare: si crea comunque l'atto, il file resta
 * PRATICA_ALLEGATA se il nome non combacia con l'euristica ODG — nessun blocco, come già oggi.
 */
export async function eseguiConvocazione(m: MailImport, tipo: TipoAtto, indiceOdgForzato?: number): Promise<EsitoEsecuzione> {
  try {
    const voci = m.allegati.flatMap(a =>
      a.filename.toLowerCase().endsWith(".zip") ? estraiVociZip(a.buffer) : [{ nomeFile: a.filename, buffer: a.buffer }]
    );

    // Una scelta forzata (dalla schermata di revisione) salta del tutto l'euristica: Marco ha
    // già guardato l'elenco file e indicato quale sia l'ODG.
    const indiceOdg = indiceOdgForzato !== undefined ? indiceOdgForzato : (voci.length > 0 ? trovaOdgInZip(voci) : null);
    if (indiceOdgForzato === undefined && indiceOdg === null && voci.length > 1) {
      return { esito: "AMBIGUO", candidati: voci.map((v, i) => ({ indice: i, nomeFile: v.nomeFile })) };
    }

    const atto = await prisma.attoPoliticoAmministrativo.create({
      data: { tipo, oggetto: m.titolo, messageId: m.messageId },
    });

    for (let i = 0; i < voci.length; i++) {
      const url = await caricaFile(`atto-${atto.id}`, voci[i].buffer, voci[i].nomeFile);
      await prisma.documentoAtto.create({
        data: { attoId: atto.id, nomeFile: voci[i].nomeFile, storageUrl: url, ruolo: i === indiceOdg ? "ORDINE_GIORNO" : "PRATICA_ALLEGATA" },
      });
    }
    if (indiceOdg !== null) await provaEstraiOdg(atto.id, voci[indiceOdg].buffer, voci[indiceOdg].nomeFile);

    return { esito: "COMPLETATO", entitaId: atto.id };
  } catch (e) {
    return { esito: "ERRORE", errore: e instanceof Error ? e.message : String(e) };
  }
}

/** Mozioni/Interrogazioni: PDF singolo, nessuna estrazione ODG, tentativo di collegamento al Consiglio successivo. */
export async function eseguiMozioneOInterrogazione(m: MailImport, tipo: TipoAtto): Promise<EsitoEsecuzione> {
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
    return { esito: "COMPLETATO", entitaId: atto.id };
  } catch (e) {
    return { esito: "ERRORE", errore: e instanceof Error ? e.message : String(e) };
  }
}

function estraiNumeroSeduta(testo: string): string | null {
  const m = testo.match(/n\.?\s*(\d+)/i);
  return m?.[1] ?? null;
}

/**
 * Verbali Giunta: si agganciano alla convocazione Giunta con lo stesso numero di seduta estratto
 * dall'oggetto (es. "n. 28"), non semplicemente alla più recente non archiviata. Se il numero non
 * si trova o non corrisponde a nessuna convocazione, non si indovina il collegamento — ma si crea
 * comunque una scheda minimale con solo il verbale, già archiviata: qui non è previsto un blocco
 * (a differenza dello zip ambiguo del Consiglio), il rischio noto della spec è esplicito su questo —
 * meglio una scheda da ricollegare a mano che un verbale perso.
 */
export async function eseguiVerbaleGiunta(m: MailImport): Promise<EsitoEsecuzione> {
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

    return { esito: "COMPLETATO", entitaId: atto.id };
  } catch (e) {
    return { esito: "ERRORE", errore: e instanceof Error ? e.message : String(e) };
  }
}

export async function eseguiGiustifica(m: MailImport): Promise<EsitoEsecuzione> {
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
    return { esito: "COMPLETATO", entitaId: giustifica.id };
  } catch (e) {
    return { esito: "ERRORE", errore: e instanceof Error ? e.message : String(e) };
  }
}
