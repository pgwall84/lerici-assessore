import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getMailPerId, marcaImportata, applicaEtichettaEArchivia, rimuoviEtichetta, getMappaEtichette, caricaAllegatiMail } from "@/lib/gmail";
import { contentTypeDaNomeFile } from "@/lib/estrazione-documenti";
import { etichettaPerCategoria, ALBERO_ETICHETTE_MAIL } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { eseguiConvocazione, eseguiMozioneOInterrogazione, eseguiVerbaleGiunta, eseguiGiustifica, eseguiContinuazione, eseguiCollegamento, eseguiCollegamentoAtto, eseguiSoloArchiviazione, type EsitoEsecuzione } from "@/lib/import-automatico";
import { decodificaEntita, trovaMessaggioPrecedenteNonProcessato } from "@/lib/continuazione";
import type { MailImport } from "@/lib/gmail";
import type { Delega, StatoAtto, StatoPratica, StatoProgetto, EsitoContestazione, TipoProgetto } from "@prisma/client";
import { z } from "zod";

const DELEGHE = [
  "VIABILITA", "AMBIENTE", "RIFIUTI", "SISTEMA_IDRICO", "ILLUMINAZIONE",
  "ACCESSIBILITA", "CIMITERI", "POLITICHE_ABITATIVE", "DIGITALIZZAZIONE", "MANUTENZIONE_PATRIMONIO",
] as const;

const STATI_ATTO = ["DA_ESAMINARE", "ESAMINATO", "RISPOSTO", "ARCHIVIATO"] as const;

const schemaAutomatico = z.object({
  indiceOdgForzato: z.number().int().min(0).optional(),
  statoIniziale: z.enum(STATI_ATTO).optional(),
});

const schemaManuale = z.object({
  // "giustifica" (minuscolo) rimossa (redesign 2026-07-24): la creazione di una Giustifica passa
  // sempre dal gestore GESTORI_AUTOMATICO["GIUSTIFICA"] (via esegui_automatico), mai più da qui —
  // il tree-picker in UI non propone più questo ramo come categoria "manuale".
  categoria: z.enum(["segnalazione", "progetto", "contestazione"]),
  titolo: z.string().min(1).max(200),
  descrizione: z.string().optional(),
  delega: z.enum(DELEGHE).optional(),
  gestore: z.enum(["ACAM_AMBIENTE", "ACAM_ACQUE", "ATC"]).optional(),
  luogo: z.string().optional(),
  nomeMittente: z.string().optional(),
  emailMittente: z.string().optional(),
  protocollo: z.string().optional(),
  dataProtocollo: z.string().optional(),
  // Stato iniziale (redesign 2026-07-24): enum pertinente al tipo risultante — StatoPratica per
  // segnalazione, StatoProgetto per progetto, EsitoContestazione per contestazione (nome del
  // selettore generico lato client, valore effettivo mappato sul campo giusto per entità qui
  // sotto). Validato liberamente (stessa fiducia già riposta in delega/gestore poco sopra): unico
  // utente autenticato, i valori arrivano sempre dai dropdown già filtrati lato UI.
  stato: z.string().optional(),
  // Solo per categoria "progetto": ipotesi Progetto/Attività, sempre sovrascrivibile a mano.
  tipoProgetto: z.enum(["PROGETTO", "ATTIVITA"]).optional(),
});

// Azione esplicita per eseguire un gestore Automatico indipendentemente dal binario originale
// della riga (redesign 2026-07-24): il tree-picker in UI copre l'intero albero delle etichette,
// non solo quelle compatibili col binario di partenza — una mail finita Manuale/Incerto perché
// priva dell'etichetta Gmail nota (es. una Mozione arrivata senza etichetta) deve poter comunque
// essere confermata come tale, con lo stesso gestore/stessa creazione Atto del percorso Automatico
// "nativo" qui sotto. Additiva rispetto al ramo AUTOMATICO esistente, non lo sostituisce: quel
// ramo resta il percorso di default, invariato, per le righe non toccate dal picker.
const schemaEseguiAutomatico = z.object({
  azione: z.literal("esegui_automatico"),
  categoria: z.string(),
  indiceOdgForzato: z.number().int().min(0).optional(),
  statoIniziale: z.enum(STATI_ATTO).optional(),
});

const GESTORI_AUTOMATICO: Record<string, (m: MailImport, indiceOdgForzato?: number, statoIniziale?: StatoAtto) => Promise<EsitoEsecuzione>> = {
  CONVOCAZIONE_CONSIGLIO: (m, i, s) => eseguiConvocazione(m, "CONVOCAZIONE_CONSIGLIO", i, s),
  CONVOCAZIONE_COMMISSIONE: (m, i, s) => eseguiConvocazione(m, "CONVOCAZIONE_COMMISSIONE", i, s),
  CONVOCAZIONE_GIUNTA: (m, i, s) => eseguiConvocazione(m, "CONVOCAZIONE_GIUNTA", i, s),
  MOZIONE: (m, _i, s) => eseguiMozioneOInterrogazione(m, "MOZIONE", s),
  INTERROGAZIONE: (m, _i, s) => eseguiMozioneOInterrogazione(m, "INTERROGAZIONE", s),
  VERBALE_GIUNTA: m => eseguiVerbaleGiunta(m),
  GIUSTIFICA: m => eseguiGiustifica(m),
  CONTINUAZIONE: m => eseguiContinuazione(m),
  DELIBERA_GIUNTA: () => eseguiSoloArchiviazione(),
  DETERMINA_GIUNTA: () => eseguiSoloArchiviazione(),
};

async function caricaFile(cartella: string, buffer: Buffer, nomeFile: string): Promise<string> {
  const ext = nomeFile.includes(".") ? nomeFile.split(".").pop() : "bin";
  const filename = `${cartella}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("foto").upload(filename, buffer, {
    contentType: contentTypeDaNomeFile(nomeFile),
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = supabase.storage.from("foto").getPublicUrl(filename);
  return publicUrl;
}

// Etichette di comodo — scritte sempre dopo COMPLETATO, sia quando l'etichetta di categoria
// era già presente su Gmail all'origine (la riscrive, idempotente) sia quando è stata dedotta
// da zero (AI o scelta manuale su Incerto/Proposta) e su Gmail non esiste ancora. Un fallimento
// qui non deve mai retrocedere l'esito: l'entità è comunque creata.
// Solo dopo che l'etichetta di categoria è stata applicata con successo (mai prima), la mail
// esce anche da INBOX (e non è più UNREAD) — vedi applicaEtichettaEArchivia. Se l'etichetta
// fallisce, l'archiviazione non viene nemmeno tentata: la mail resta in INBOX, ritrovabile.
async function applicaEtichetteFinali(rigaId: string, messageId: string, nomeEtichetta: string | null, etichetteAttuali: string[]) {
  try { await marcaImportata(messageId); } catch { /* etichetta di comodo, non blocca l'esito */ }
  if (nomeEtichetta) {
    try {
      await applicaEtichettaEArchivia(messageId, nomeEtichetta);
      // Solo dopo che la nuova etichetta è stata applicata con successo (mai prima — se
      // l'applicazione fosse fallita, meglio lasciare la mail con l'etichetta vecchia che senza
      // nessuna): rimuove le altre etichette della tassonomia già presenti sul messaggio che non
      // coincidono più con la scelta finale. Caso reale (diagnosi 2026-07-25): una mail arrivata
      // con "Segnalazioni" (da un filtro Gmail) ricategorizzata a mano su "Deleghe/Viabilità" —
      // senza questo, restava con entrambe le etichette contemporaneamente. Vale per qualunque
      // cambio, non solo "Segnalazioni": confronta contro ALBERO_ETICHETTE_MAIL, la stessa lista
      // di categorie mostrata nel tree-picker.
      const daRimuovere = etichetteAttuali.filter(e => e !== nomeEtichetta && ALBERO_ETICHETTE_MAIL.some(n => n.etichetta === e));
      for (const e of daRimuovere) {
        try { await rimuoviEtichetta(messageId, e); } catch { /* comodo, non blocca l'esito */ }
      }
    } catch {
      // Reso visibile, non solo tollerato: stesso principio dei contatori Bandi.
      await prisma.mailProcessata.update({ where: { id: rigaId }, data: { archiviazioneFallita: true } }).catch(() => {});
    }
  }
}

// Conferma unica per qualunque riga MailProcessata IN_ATTESA (sezione 6, Sessione C):
// - AUTOMATICO: esegue il gestore già usato dal cron (Sessione B); se torna AMBIGUO, ritorna
//   l'elenco file per la scelta manuale, senza scrivere nulla — si richiama lo stesso endpoint
//   con indiceOdgForzato per completare.
// - PROPOSTA_CONTINUAZIONE (match debole, sezione 6 evolutiva): "collega" aggancia l'entità già
//   decisa in fase di scan (nessuna nuova ricerca, Marco l'ha già vista in UI); "nuova" ignora la
//   proposta e ricade nello stesso flusso di creazione di Manuale/Incerto qui sotto.
// - MANUALE / INCERTO: crea l'entità scelta/confermata da Marco (stessa logica già collaudata
//   nel vecchio POST di /api/import-mail, ora qui).
// - "collega_esistente" (qualunque binario): collegamento manuale a un'entità già esistente,
//   trovata da Marco con una ricerca libera (/api/motore-mail/cerca-entita) invece che dalla
//   catena automatica — copre i falsi negativi della catena (vedi diagnosi 2026-07-24).
// In tutti i casi: DB (esito COMPLETATO) sempre prima delle etichette Gmail.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const riga = await prisma.mailProcessata.findUnique({ where: { id } });
  if (!riga) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  if (riga.esito !== "IN_ATTESA") return NextResponse.json({ error: "Questa riga è già stata gestita" }, { status: 409 });

  const mail = await getMailPerId(riga.messageId);
  if (!mail) return NextResponse.json({ error: "Mail non trovata su Gmail" }, { status: 404 });

  // Nomi delle etichette Gmail attualmente sul messaggio — usati da applicaEtichetteFinali per
  // ripulire quelle della tassonomia in conflitto con la categoria scelta alla conferma.
  const mappaEtichette = await getMappaEtichette();
  const nomiEtichetteAttuali = mail.labelIds.map(lid => mappaEtichette.get(lid)).filter((n): n is string => !!n);

  // Letto una sola volta: il branch AUTOMATICO/PROPOSTA_CONTINUAZIONE lo valida col proprio
  // schema, quello Manuale/Incerto/"Crea nuova" più sotto riusa lo stesso oggetto già letto.
  const body = await req.json().catch(() => ({}));

  // Override esplicito da tree-picker: controllato PRIMA del ramo binario-implicito qui sotto,
  // così una riga già Automatico ma corretta a mano a un'altra categoria Automatico passa di qui,
  // non dal suo ramo "nativo" (che userebbe sempre riga.categoriaProposta, ignorando la scelta).
  const parsedEseguiAutomatico = schemaEseguiAutomatico.safeParse(body);
  if (parsedEseguiAutomatico.success) {
    const { categoria, indiceOdgForzato, statoIniziale } = parsedEseguiAutomatico.data;
    const gestore = GESTORI_AUTOMATICO[categoria];
    if (!gestore) return NextResponse.json({ error: "Categoria non riconosciuta" }, { status: 400 });

    // Atti/Giustifica non hanno un diario dove far confluire il messaggio corrente come nota —
    // a differenza di Manuale (segnalazione/progetto/contestazione, più sotto), qui non si
    // swappa l'origine: si blocca con un messaggio chiaro, stesso principio del declassamento
    // nel cron (diagnosi 2026-07-25). Una volta che il messaggio precedente verrà scansionato
    // per conto suo, questo si potrà agganciare con "Collega a esistente".
    const messaggioPrecedenteAuto = await trovaMessaggioPrecedenteNonProcessato(mail);
    if (messaggioPrecedenteAuto) {
      return NextResponse.json({
        error: `Trovato un messaggio precedente non ancora processato nello stesso thread (del ${messaggioPrecedenteAuto.data}, oggetto "${messaggioPrecedenteAuto.titolo}"). Attendi che venga scansionato separatamente, poi usa "Collega a esistente" per agganciare questa mail all'entità che verrà creata da quello.`,
      }, { status: 409 });
    }

    const esito = await gestore(mail, indiceOdgForzato, statoIniziale);

    if (esito.esito === "AMBIGUO") {
      return NextResponse.json({ ambiguo: true, candidati: esito.candidati });
    }
    if (esito.esito === "ERRORE") {
      await prisma.mailProcessata.update({ where: { id }, data: { esito: "ERRORE" } });
      return NextResponse.json({ error: esito.errore }, { status: 500 });
    }

    await prisma.mailProcessata.update({ where: { id }, data: { esito: "COMPLETATO", entitaCreataId: esito.entitaId ?? null } });
    await applicaEtichetteFinali(id, riga.messageId, esito.etichetta ?? etichettaPerCategoria(categoria), nomiEtichetteAttuali);
    return NextResponse.json({ completato: true, entitaId: esito.entitaId ?? null });
  }

  if (riga.binario === "AUTOMATICO") {
    const parsed = schemaAutomatico.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const gestore = riga.categoriaProposta ? GESTORI_AUTOMATICO[riga.categoriaProposta] : undefined;
    if (!gestore) return NextResponse.json({ error: "Categoria Automatico non riconosciuta" }, { status: 500 });

    // CONTINUAZIONE esclusa: lì ci si aggancia a un'entità già esistente, non se ne crea una
    // nuova — il caso qui sotto non si applica (diagnosi 2026-07-25).
    if (riga.categoriaProposta !== "CONTINUAZIONE") {
      const messaggioPrecedenteAuto = await trovaMessaggioPrecedenteNonProcessato(mail);
      if (messaggioPrecedenteAuto) {
        return NextResponse.json({
          error: `Trovato un messaggio precedente non ancora processato nello stesso thread (del ${messaggioPrecedenteAuto.data}, oggetto "${messaggioPrecedenteAuto.titolo}"). Attendi che venga scansionato separatamente, poi usa "Collega a esistente" per agganciare questa mail all'entità che verrà creata da quello.`,
        }, { status: 409 });
      }
    }

    const esito = await gestore(mail, parsed.data.indiceOdgForzato, parsed.data.statoIniziale);

    if (esito.esito === "AMBIGUO") {
      return NextResponse.json({ ambiguo: true, candidati: esito.candidati });
    }
    if (esito.esito === "ERRORE") {
      await prisma.mailProcessata.update({ where: { id }, data: { esito: "ERRORE" } });
      return NextResponse.json({ error: esito.errore }, { status: 500 });
    }

    await prisma.mailProcessata.update({ where: { id }, data: { esito: "COMPLETATO", entitaCreataId: esito.entitaId ?? null } });
    await applicaEtichetteFinali(id, riga.messageId, esito.etichetta ?? (riga.categoriaProposta ? etichettaPerCategoria(riga.categoriaProposta) : null), nomiEtichetteAttuali);
    return NextResponse.json({ completato: true, entitaId: esito.entitaId ?? null });
  }

  if (riga.binario === "PROPOSTA_CONTINUAZIONE" && (body as { azione?: string })?.azione === "collega") {
    const decodificata = decodificaEntita(riga.categoriaProposta);
    if (!decodificata) return NextResponse.json({ error: "Proposta di continuazione non decodificabile" }, { status: 500 });

    const esito = await eseguiCollegamento(mail, decodificata.tipo, decodificata.id);
    if (esito.esito === "ERRORE") {
      await prisma.mailProcessata.update({ where: { id }, data: { esito: "ERRORE" } });
      return NextResponse.json({ error: esito.errore }, { status: 500 });
    }
    if (esito.esito === "COMPLETATO") {
      await prisma.mailProcessata.update({ where: { id }, data: { esito: "COMPLETATO", entitaCreataId: esito.entitaId ?? null } });
      await applicaEtichetteFinali(id, riga.messageId, esito.etichetta ?? null, nomiEtichetteAttuali);
      return NextResponse.json({ completato: true, entitaId: esito.entitaId });
    }
    // "AMBIGUO" non è previsto per eseguiCollegamento — trattato come errore difensivo.
    return NextResponse.json({ error: "Esito inatteso" }, { status: 500 });
  }

  // Collegamento manuale (sezione 6, oltre la catena automatica): Marco ha cercato e scelto lui
  // stesso l'entità, per una riga Manuale/Incerto (o anche Proposta continuazione, se preferisce
  // ignorare il suggerimento e sceglierne un'altra). Stessa esecuzione di eseguiCollegamento usata
  // sopra per il match automatico — nota nel diario + allegati + etichetta/archiviazione coerenti.
  const schemaCollegaEsistente = z.object({
    azione: z.literal("collega_esistente"),
    tipo: z.enum(["pratica", "progetto", "contestazione", "atto"]),
    entitaId: z.string().min(1),
  });
  const parsedCollegaEsistente = schemaCollegaEsistente.safeParse(body);
  if (parsedCollegaEsistente.success) {
    const { tipo, entitaId } = parsedCollegaEsistente.data;
    // Atti: solo allegati, nessuna nota nel diario (Atti non ne hanno uno) — vedi
    // eseguiCollegamentoAtto. Caso reale: convocazione inviata più volte via PEC con allegati
    // diversi per limite di dimensione, l'Atto è già stato creato dal primo invio.
    const esito = tipo === "atto" ? await eseguiCollegamentoAtto(mail, entitaId) : await eseguiCollegamento(mail, tipo, entitaId);
    if (esito.esito === "ERRORE") {
      await prisma.mailProcessata.update({ where: { id }, data: { esito: "ERRORE" } });
      return NextResponse.json({ error: esito.errore }, { status: 500 });
    }
    if (esito.esito === "COMPLETATO") {
      await prisma.mailProcessata.update({ where: { id }, data: { esito: "COMPLETATO", entitaCreataId: esito.entitaId ?? null } });
      await applicaEtichetteFinali(id, riga.messageId, esito.etichetta ?? null, nomiEtichetteAttuali);
      return NextResponse.json({ completato: true, entitaId: esito.entitaId });
    }
    return NextResponse.json({ error: "Esito inatteso" }, { status: 500 });
  }

  // MANUALE, INCERTO, o PROPOSTA_CONTINUAZIONE con "Crea nuova" (azione !== "collega")
  const parsed = schemaManuale.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  if ((d.categoria === "segnalazione" || d.categoria === "progetto") && !d.delega) {
    return NextResponse.json({ error: "Delega obbligatoria" }, { status: 400 });
  }
  if (d.categoria === "contestazione" && !d.gestore) {
    return NextResponse.json({ error: "Gestore obbligatorio" }, { status: 400 });
  }

  // Prima di creare una nuova entità (umano presente su questa schermata): verifica dal vivo —
  // dati vivi, non fidarsi di quanto mostrato in precedenza — se esiste un messaggio precedente
  // nello stesso thread mai processato. Se sì, ha probabilmente il contesto pieno (la richiesta
  // originale, non solo una risposta di follow-up): diventa la vera origine (messageId +
  // allegati), il messaggio corrente (quello originariamente proposto) diventa una nota nel
  // diario invece del contenuto iniziale (diagnosi 2026-07-25).
  const messaggioPrecedente = await trovaMessaggioPrecedenteNonProcessato(mail);
  const mailOrigine = messaggioPrecedente ?? mail;
  const testoNotaOrigineSpostata = mail.descrizione.trim() || mail.titolo;

  let entitaId: string;
  try {
    if (d.categoria === "segnalazione") {
      const pratica = await prisma.pratica.create({
        data: {
          titolo: d.titolo,
          descrizione: d.descrizione || null,
          luogo: d.luogo || null,
          protocollo: d.protocollo || null,
          dataProtocollo: d.dataProtocollo || null,
          tipo: "SEGNALAZIONE",
          stato: (d.stato as StatoPratica) || "APERTA",
          priorita: "MEDIA",
          messageId: mailOrigine.messageId,
          delega: d.delega as never,
          ...(d.nomeMittente ? { segnalante: { create: { nome: d.nomeMittente, email: d.emailMittente || null } } } : {}),
        },
      });
      if (mailOrigine.allegati.length) {
        const urls = await caricaAllegatiMail(mailOrigine.allegati, pratica.id);
        await Promise.all(urls.map(url => prisma.foto.create({ data: { praticaId: pratica.id, path: url } })));
      }
      if (messaggioPrecedente) {
        await prisma.nota.create({ data: { praticaId: pratica.id, testo: testoNotaOrigineSpostata } });
        if (mail.allegati.length) {
          const urls = await caricaAllegatiMail(mail.allegati, pratica.id);
          await Promise.all(urls.map(url => prisma.foto.create({ data: { praticaId: pratica.id, path: url } })));
        }
      }
      entitaId = String(pratica.id);
    } else if (d.categoria === "progetto") {
      const progetto = await prisma.progetto.create({
        data: {
          titolo: d.titolo,
          delega: d.delega as never,
          descrizione: d.descrizione || null,
          messageId: mailOrigine.messageId,
          ...(d.stato ? { stato: d.stato as StatoProgetto } : {}),
          ...(d.tipoProgetto ? { tipo: d.tipoProgetto as TipoProgetto } : {}),
        },
      });
      await Promise.all(mailOrigine.allegati.map(async a => {
        const url = await caricaFile(`progetto-${progetto.id}`, a.buffer, a.filename);
        await prisma.documentoProgetto.create({ data: { progettoId: progetto.id, nomeFile: a.filename, storageUrl: url } });
      }));
      if (messaggioPrecedente) {
        await prisma.notaProgetto.create({ data: { progettoId: progetto.id, testo: testoNotaOrigineSpostata } });
        await Promise.all(mail.allegati.map(async a => {
          const url = await caricaFile(`progetto-${progetto.id}`, a.buffer, a.filename);
          await prisma.documentoProgetto.create({ data: { progettoId: progetto.id, nomeFile: a.filename, storageUrl: url } });
        }));
      }
      entitaId = progetto.id;
    } else {
      const contestazione = await prisma.contestazione.create({
        data: {
          gestore: d.gestore as never,
          oggetto: d.titolo,
          descrizione: d.descrizione || null,
          messageId: mailOrigine.messageId,
          // Il selettore "stato iniziale" generico lato client mappa qui sul campo esito
          // (nome specifico di Contestazione, StatoPratica/StatoProgetto altrove).
          ...(d.stato ? { esito: d.stato as EsitoContestazione } : {}),
        },
      });
      await Promise.all(mailOrigine.allegati.map(async a => {
        const url = await caricaFile(`contestazione-${contestazione.id}`, a.buffer, a.filename);
        await prisma.documentoContestazione.create({ data: { contestazioneId: contestazione.id, nomeFile: a.filename, storageUrl: url } });
      }));
      if (messaggioPrecedente) {
        await prisma.notaContestazione.create({ data: { contestazioneId: contestazione.id, testo: testoNotaOrigineSpostata } });
        await Promise.all(mail.allegati.map(async a => {
          const url = await caricaFile(`contestazione-${contestazione.id}`, a.buffer, a.filename);
          await prisma.documentoContestazione.create({ data: { contestazioneId: contestazione.id, nomeFile: a.filename, storageUrl: url } });
        }));
      }
      entitaId = contestazione.id;
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  const etichettaScelta = etichettaPerCategoria(d.categoria, d.delega as Delega | undefined);
  await prisma.mailProcessata.update({ where: { id }, data: { esito: "COMPLETATO", entitaCreataId: entitaId } });
  await applicaEtichetteFinali(id, riga.messageId, etichettaScelta, nomiEtichetteAttuali);

  // Il messaggio precedente usato come origine va marcato come già gestito — nuova riga
  // MailProcessata COMPLETATO, per evitare che un futuro scan lo ritratti come nuovo — ed
  // etichettato/archiviato a sua volta, stesso trattamento del messaggio corrente.
  if (messaggioPrecedente) {
    await prisma.mailProcessata.create({
      data: {
        messageId: messaggioPrecedente.messageId,
        threadId: messaggioPrecedente.threadId || null,
        mittente: messaggioPrecedente.mittente,
        oggetto: messaggioPrecedente.oggettoOriginale,
        categoriaProposta: d.categoria,
        confidenza: 1,
        binario: "MANUALE",
        esito: "COMPLETATO",
        entitaCreataId: entitaId,
      },
    });
    if (etichettaScelta) {
      try { await applicaEtichettaEArchivia(messaggioPrecedente.messageId, etichettaScelta); } catch { /* comodo, non blocca l'esito */ }
    }
  }

  return NextResponse.json({ completato: true, entitaId });
}
