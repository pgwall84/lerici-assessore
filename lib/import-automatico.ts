import { prisma } from "@/lib/prisma";
import { caricaAllegatiMail, type MailImport } from "@/lib/gmail";
import { contentTypeDaNomeFile, estraiTestoDaFile, estraiVociZip, trovaOdgInZip } from "@/lib/estrazione-documenti";
import { riformattaOdg } from "@/lib/claude";
import { etichettaPerCategoria } from "@/lib/constants";
import { trovaContinuazioneForte, type TipoEntitaContinuazione } from "@/lib/continuazione";
import { supabase } from "@/lib/supabase";
import type { TipoAtto } from "@prisma/client";

const BUCKET = "foto";

// Esito dell'esecuzione di una singola mail del binario Automatico (motore di scansione,
// sezione 6). A differenza del vecchio `RisultatoImport` (aggregato su un intero elenco), qui
// si esegue una mail alla volta perché il punto di ingresso è ora una riga MailProcessata, non
// più una query diretta a Gmail per etichetta.
export type EsitoEsecuzione =
  // `etichetta`: solo per i gestori (es. eseguiContinuazione) la cui entità di destinazione non
  // è ricavabile dal semplice categoriaProposta della riga — il chiamante la usa al posto del
  // lookup generico via etichettaPerCategoria(riga.categoriaProposta).
  | { esito: "COMPLETATO"; entitaId: string; etichetta?: string }
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

// Soglia minima per considerare il corpo mail "sostanziale" e non solo firma/disclaimer — una
// mail di sola firma (nome, ruolo, contatti, una riga di riservatezza) è tipicamente ben sotto
// questa lunghezza; un vero testo di mozione/interrogazione (documento formale strutturato) è
// sempre ben oltre.
const SOGLIA_CORPO_SOSTANZIALE = 300;

/** Mozioni/Interrogazioni: PDF singolo, nessuna estrazione ODG, tentativo di collegamento al Consiglio successivo.
 *
 * Fallback quando manca un allegato PDF/DOCX: il testo della mozione/interrogazione può stare
 * solo nel corpo HTML della mail (caso reale: "Presentazione mozione Rifacimento del campo da
 * calcio a 7 in località Bagnara" — Atto creato ma senza nessun documento consultabile). Se il
 * corpo è sostanziale, lo si salva ripulito come `corpoTestoEstratto` — l'Atto resta leggibile in
 * app anche senza un file scaricabile. */
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

    if (m.allegati.length === 0) {
      const corpoPulito = m.corpoCompleto.replace(/\n{3,}/g, "\n\n").trim();
      if (corpoPulito.length >= SOGLIA_CORPO_SOSTANZIALE) {
        await prisma.attoPoliticoAmministrativo.update({
          where: { id: atto.id },
          data: { corpoTestoEstratto: corpoPulito },
        });
      }
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

/**
 * Aggancia una mail a un'entità già nota (tipo+id espliciti, non ri-derivata) con una nota nel
 * diario + eventuali allegati — nessuna nuova entità creata. Condivisa da:
 * - `eseguiContinuazione`, per i match forti (protocollo/threadId), che prima ri-trova l'entità
 * - la conferma "Collega" del match debole (Sessione C), dove l'entità è già stata decisa da
 *   Marco e arriva già come tipo+id, senza bisogno di ri-eseguire nessuna ricerca
 */
export async function eseguiCollegamento(m: MailImport, tipo: TipoEntitaContinuazione, id: string): Promise<EsitoEsecuzione> {
  try {
    const testoNota = m.descrizione.trim() || m.titolo;

    if (tipo === "pratica") {
      const praticaId = Number(id);
      const pratica = await prisma.pratica.findUnique({ where: { id: praticaId } });
      if (!pratica) return { esito: "ERRORE", errore: "Pratica non più trovata" };
      await prisma.nota.create({ data: { praticaId, testo: testoNota } });
      if (m.allegati.length) {
        const urls = await caricaAllegatiMail(m.allegati, praticaId);
        await Promise.all(urls.map(url => prisma.foto.create({ data: { praticaId, path: url } })));
      }
      return { esito: "COMPLETATO", entitaId: String(praticaId), etichetta: etichettaPerCategoria("segnalazione") ?? undefined };
    }

    if (tipo === "progetto") {
      const progetto = await prisma.progetto.findUnique({ where: { id } });
      if (!progetto) return { esito: "ERRORE", errore: "Progetto non più trovato" };
      await prisma.notaProgetto.create({ data: { progettoId: progetto.id, testo: testoNota } });
      await Promise.all(m.allegati.map(async a => {
        const url = await caricaFile(`progetto-${progetto.id}`, a.buffer, a.filename);
        await prisma.documentoProgetto.create({ data: { progettoId: progetto.id, nomeFile: a.filename, storageUrl: url } });
      }));
      return { esito: "COMPLETATO", entitaId: progetto.id, etichetta: etichettaPerCategoria("progetto", progetto.delega) ?? undefined };
    }

    // contestazione
    const contestazione = await prisma.contestazione.findUnique({ where: { id } });
    if (!contestazione) return { esito: "ERRORE", errore: "Contestazione non più trovata" };
    await prisma.notaContestazione.create({ data: { contestazioneId: contestazione.id, testo: testoNota } });
    await Promise.all(m.allegati.map(async a => {
      const url = await caricaFile(`contestazione-${contestazione.id}`, a.buffer, a.filename);
      await prisma.documentoContestazione.create({ data: { contestazioneId: contestazione.id, nomeFile: a.filename, storageUrl: url } });
    }));
    return { esito: "COMPLETATO", entitaId: contestazione.id, etichetta: etichettaPerCategoria("contestazione") ?? undefined };
  } catch (e) {
    return { esito: "ERRORE", errore: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Match forte di continuazione (protocollo/threadId, sezione 6 evolutiva): non crea una nuova
 * entità, aggancia la mail a quella già trovata. Ri-esegue la ricerca invece di fidarsi di un
 * riferimento salvato in MailProcessata — stesso principio già usato per la delega dei Progetti
 * (Sessione C): i dati vivi restano la fonte di verità, non una stringa serializzata allo scan.
 */
export async function eseguiContinuazione(m: MailImport): Promise<EsitoEsecuzione> {
  const risultato = await trovaContinuazioneForte(m);
  if (risultato.esito !== "trovato") {
    // "ambiguo" qui non dovrebbe mai capitare: una riga MailProcessata arriva a questo gestore
    // solo se la classificazione l'aveva già marcata AUTOMATICO, cosa che non succede più per un
    // protocollo ambiguo (va a PROPOSTA_CONTINUAZIONE). Trattato comunque come errore difensivo,
    // mai come "scegli il primo e vai".
    return { esito: "ERRORE", errore: "Continuazione non più trovata o diventata ambigua (protocollo/thread non corrispondono più in modo univoco)" };
  }
  return eseguiCollegamento(m, risultato.entita.tipo, risultato.entita.id);
}
