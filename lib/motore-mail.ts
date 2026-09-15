import { prisma } from "@/lib/prisma";
import { getMailsPaginato, getMappaEtichette, getMailPerId, marcaImportata, marcaIncerto, marcaNonRilevante, applicaEtichettaEArchivia, archiviaMail, rimuoviEtichetta, type MailImport } from "@/lib/gmail";
import { classificaMail } from "@/lib/claude";
import { TASSONOMIA_MAIL, categoriaProposta, etichettaPerCategoria, ETICHETTA_NON_RILEVANTE, ETICHETTA_DELEGA_DA_SPECIFICARE, ALBERO_ETICHETTE_MAIL, ETICHETTE_SEGNALAZIONE, ETICHETTA_DELEGA, type VoceTassonomiaMail } from "@/lib/constants";
import { classificaDelega, categoriaVariaPerDominio, classificaDup, classificaBilancio, categoriaGestoreEntrataPerIndirizzo } from "@/lib/classificatore";
import { eseguiConvocazione, eseguiMozioneOInterrogazione, eseguiVerbaleGiunta, eseguiGiustifica, eseguiContinuazione, eseguiProgettoVarie, eseguiContestazioneGestore, type EsitoEsecuzione } from "@/lib/import-automatico";
import { trovaContinuazioneForte, trovaContinuazioneDebole, codificaEntita, trovaMessaggioPrecedenteNonProcessato } from "@/lib/continuazione";
import { trovaOCreaEnteVario } from "@/lib/enti-vari";
import { trovaOCreaSottoTema } from "@/lib/sotto-temi";
import type { Delega } from "@prisma/client";

const SOGLIA_CONFIDENZA = 0.6;
// Più alta delle altre categorie di proposito: un falso positivo qui scompare subito senza mai
// passare da un controllo umano (a differenza di segnalazione/progetto/contestazione, che restano
// comunque in Manuale a conferma). Verificato dal vivo il 2026-07-20: con la soglia generica (0.6)
// una mail di chiusura di una vera segnalazione cittadina ("Mancato ritiro ingombranti", confidenza
// 0.85) è stata classificata non_rilevante — alzata la soglia specifica per ridurre il rischio.
const SOGLIA_NON_RILEVANTE = 0.9;

export type RisultatoScansione = {
  processate: number;
  automatico: number;
  manuale: number;
  incerto: number;
  nonRilevante: number;
  propostaContinuazione: number;
  fuoriScope: number;
  nextPageToken?: string;
};

// Ritorna anche il nome dell'etichetta Gmail che ha determinato il match (non solo la regola),
// per il badge "etichetta/sotto-etichetta" per esteso mostrato in UI (etichettaProposta).
export function trovaVoceTassonomia(nomiEtichette: string[]): { etichetta: string; voce: VoceTassonomiaMail } | null {
  for (const nome of nomiEtichette) {
    const voce = TASSONOMIA_MAIL[nome];
    if (voce) return { etichetta: nome, voce };
  }
  return null;
}

// Ricostruisce l'etichetta/sotto-etichetta per esteso a partire da una categoria già risolta
// (dal ramo AI o da una riga già in MailProcessata) — usata quando non c'è un match di regola
// diretto su cui appoggiarsi. Per "progetto" ricava anche la delega (stessa euristica per
// parole chiave già in uso in /api/motore-mail/revisione), per le altre categorie basta il
// lookup generico già esistente in etichettaPerCategoria().
export function calcolaEtichettaProposta(categoria: string | null, testoPerDelega: string): string | null {
  if (!categoria) return null;
  if (categoria === "progetto") {
    const delega = classificaDelega(testoPerDelega);
    return delega ? etichettaPerCategoria(categoria, delega as Delega) : ETICHETTA_DELEGA_DA_SPECIFICARE;
  }
  return etichettaPerCategoria(categoria);
}

type Esito = "AUTOMATICO" | "MANUALE" | "INCERTO" | "NON_RILEVANTE" | "PROPOSTA_CONTINUAZIONE" | "FUORI_SCOPE";

// Scrive (al più) una riga MailProcessata per la mail — mai un'azione sull'entità né
// un'etichetta "Importata"/di categoria: quelle restano legate a un esito COMPLETATO di
// creazione entità, di competenza della Sessione B. L'unica etichetta scritta qui è
// "Incerto/Da classificare", puramente informativa sullo stato di classificazione.
async function classificaESalva(m: MailImport, nomiEtichette: string[]): Promise<Esito> {
  // Livelli 1-2 della catena di continuazione (protocollo, poi threadId): controllati PRIMA di
  // qualunque etichetta/classificazione, perché sono un segnale affidabile a prescindere — una
  // mail può avere l'etichetta "Segnalazioni" (da filtro Gmail) ed essere comunque la prosecuzione
  // di una pratica già esistente, non una nuova. Match forte univoco -> sempre Automatico, mai
  // indovinato. Match forte AMBIGUO (protocollo su più di un'entità) -> mai eseguito da solo:
  // declassato a PROPOSTA_CONTINUAZIONE come il match debole, con avviso esplicito in UI.
  const continuazioneForte = await trovaContinuazioneForte(m);
  if (continuazioneForte.esito === "trovato") {
    await prisma.mailProcessata.create({
      data: {
        messageId: m.messageId,
        threadId: m.threadId || null,
        mittente: m.mittente,
        oggetto: m.oggettoOriginale,
        categoriaProposta: "CONTINUAZIONE",
        confidenza: 1,
        binario: "AUTOMATICO",
      },
    });
    return "AUTOMATICO";
  }
  if (continuazioneForte.esito === "ambiguo") {
    await prisma.mailProcessata.create({
      data: {
        messageId: m.messageId,
        threadId: m.threadId || null,
        mittente: m.mittente,
        oggetto: m.oggettoOriginale,
        categoriaProposta: codificaEntita(continuazioneForte.candidati[0], true),
        confidenza: null,
        binario: "PROPOSTA_CONTINUAZIONE",
      },
    });
    return "PROPOSTA_CONTINUAZIONE";
  }

  const voceNota = trovaVoceTassonomia(nomiEtichette);
  const voce = voceNota?.voce;

  if (voce && "fuoriScope" in voce) {
    return "FUORI_SCOPE";
  }

  if (voceNota && voce) {
    await prisma.mailProcessata.create({
      data: {
        messageId: m.messageId,
        threadId: m.threadId || null,
        mittente: m.mittente,
        oggetto: m.oggettoOriginale,
        categoriaProposta: categoriaProposta(voce),
        // Il match di regola già È l'etichetta specifica (es. "Deleghe/Viabilità") — nessuna
        // ricostruzione necessaria, a differenza dei rami AI qui sotto.
        etichettaProposta: voceNota.etichetta,
        confidenza: 1,
        binario: voce.binario,
      },
    });
    return voce.binario;
  }

  // "Varie" (evolutiva 2026-07-25): instradamento per dominio mittente, regola scritta nel
  // codice (categoriaVariaPerDominio) — non un'etichetta Gmail preesistente. Deterministico come
  // le regole sopra: controllato prima della classificazione AI, nessuna chiamata sprecata.
  const categoriaVariaDominio = categoriaVariaPerDominio(m.emailMittente);
  if (categoriaVariaDominio) {
    await prisma.mailProcessata.create({
      data: {
        messageId: m.messageId,
        threadId: m.threadId || null,
        mittente: m.mittente,
        oggetto: m.oggettoOriginale,
        categoriaProposta: categoriaVariaDominio,
        etichettaProposta: etichettaPerCategoria(categoriaVariaDominio),
        confidenza: 1,
        binario: "AUTOMATICO",
      },
    });
    return "AUTOMATICO";
  }

  // Gestori in entrata (Fase 2 sezione 6.2): mail che arriva DA un gestore esterno, istradata per
  // indirizzo mittente esatto — non in risposta a una Contestazione già tracciata (quel caso è
  // già intercettato più sopra da trovaContinuazioneForte, prima di questa funzione). Stesso
  // trattamento deterministico/Automatico di ANCI/Regione/Governo sopra.
  const categoriaGestoreEntrata = categoriaGestoreEntrataPerIndirizzo(m.emailMittente);
  if (categoriaGestoreEntrata) {
    await prisma.mailProcessata.create({
      data: {
        messageId: m.messageId,
        threadId: m.threadId || null,
        mittente: m.mittente,
        oggetto: m.oggettoOriginale,
        categoriaProposta: categoriaGestoreEntrata,
        etichettaProposta: etichettaPerCategoria(categoriaGestoreEntrata),
        confidenza: 1,
        binario: "AUTOMATICO",
      },
    });
    return "AUTOMATICO";
  }

  // Giunta/Dup (evolutiva 2026-07-26): parola chiave nell'oggetto, non un'etichetta Gmail —
  // stesso principio deterministico delle regole sopra, controllato prima dell'AI. Binario
  // MANUALE (non Automatico, a differenza di ANCI/REGIONE/GOVERNO): il segnale è pulito sul
  // campione osservato ma troppo piccolo per fidarsi ciecamente — categoria/etichetta comunque
  // già pre-compilate, risparmia solo la conferma finale a Marco, non la classificazione.
  if (classificaDup(m.oggettoOriginale)) {
    await prisma.mailProcessata.create({
      data: {
        messageId: m.messageId,
        threadId: m.threadId || null,
        mittente: m.mittente,
        oggetto: m.oggettoOriginale,
        categoriaProposta: "DUP",
        etichettaProposta: etichettaPerCategoria("DUP"),
        confidenza: 1,
        binario: "MANUALE",
      },
    });
    return "MANUALE";
  }

  // Giunta/Bilancio (Fase 2 sezione 7): stesso trattamento di Giunta/Dup sopra.
  if (classificaBilancio(m.oggettoOriginale)) {
    await prisma.mailProcessata.create({
      data: {
        messageId: m.messageId,
        threadId: m.threadId || null,
        mittente: m.mittente,
        oggetto: m.oggettoOriginale,
        categoriaProposta: "BILANCIO",
        etichettaProposta: etichettaPerCategoria("BILANCIO"),
        confidenza: 1,
        binario: "MANUALE",
      },
    });
    return "MANUALE";
  }

  // Nessuna etichetta nota sul messaggio: prova la classificazione AI prima di arrendersi a Incerto.
  // Un errore qui (es. chiave Claude non configurata) non deve mai bloccare lo scan — degrada a Incerto.
  let classificazione: Awaited<ReturnType<typeof classificaMail>> = null;
  try {
    classificazione = await classificaMail(m.mittente, m.oggettoOriginale, m.descrizione);
  } catch {
    // ignorato di proposito — vedi commento sopra
  }

  if (classificazione && classificazione.categoria === "non_rilevante") {
    if (classificazione.confidenza >= SOGLIA_NON_RILEVANTE) {
      // Fuori scope per il tool: nessuna entità, si risolve subito — non ha senso farla
      // accumulare in Incerto insieme ai casi genuinamente ambigui. Nota: questo esito
      // COMPLETATO salta di proposito il gate primaEsecuzione() (vedi commento su quella
      // funzione più sotto) — non è un'azione reale su cui serva prima una conferma umana.
      const rigaCreata = await prisma.mailProcessata.create({
        data: {
          messageId: m.messageId,
          threadId: m.threadId || null,
          mittente: m.mittente,
          oggetto: m.oggettoOriginale,
          categoriaProposta: classificazione.categoria,
          // Mai mostrata in UI (completa subito, mai in coda) — persistita solo per coerenza/audit.
          etichettaProposta: ETICHETTA_NON_RILEVANTE,
          confidenza: classificazione.confidenza,
          binario: "NON_RILEVANTE",
          esito: "COMPLETATO",
        },
      });
      try {
        await marcaNonRilevante(m.messageId);
        // Rimuove eventuali etichette di tassonomia già presenti (es. "Segnalazioni" da un
        // filtro Gmail troppo largo) che l'AI ha giudicato non pertinenti — stesso principio del
        // fix sul tree-picker (diagnosi 2026-07-25): mai lasciare due etichette di categoria in
        // conflitto sullo stesso messaggio, qui come lì.
        // "Istituzioni/<ente>" (chiamata "Varie" fino al 2026-09-15) incluso anche quando l'ente
        // non è uno dei 4 nodi statici dell'albero (Fase 2 sezione 5: un ente aggiunto al volo non
        // ha un nodo fisso qui) — qualunque etichetta sotto "Istituzioni/" è comunque di
        // competenza di questa tassonomia.
        const daRimuovere = nomiEtichette.filter(e => ALBERO_ETICHETTE_MAIL.some(n => n.etichetta === e) || e.startsWith("Istituzioni/") || ETICHETTE_SEGNALAZIONE.includes(e));
        for (const e of daRimuovere) {
          try { await rimuoviEtichetta(m.messageId, e); } catch { /* comodo, non blocca l'esito */ }
        }
        // Solo dopo l'etichetta con successo: fuori INBOX, non più da leggere (sessione 2, mail).
        await archiviaMail(m.messageId);
      } catch {
        // Etichetta/archiviazione di comodo: un fallimento qui non blocca lo scan né retrocede
        // l'esito (l'entità — qui: nessuna — è comunque "gestita" secondo il binario). Va però
        // reso visibile, non solo tollerato: stesso principio dei contatori di estrazione Bandi.
        await prisma.mailProcessata.update({ where: { id: rigaCreata.id }, data: { archiviazioneFallita: true } }).catch(() => {});
      }
      return "NON_RILEVANTE";
    }
    // Confidenza insufficiente per la soglia più alta di non_rilevante: NON deve cadere nel ramo
    // Manuale sotto ("non_rilevante" non è una categoria selezionabile in quel form) — va dritta
    // a Incerto (categoria/confidenza restano comunque salvate, solo informative).
  }

  if (classificazione && classificazione.categoria !== "non_rilevante" && classificazione.confidenza >= SOGLIA_CONFIDENZA) {
    // L'AI propone solo una categoria: non produce mai un'azione automatica, sempre a conferma.
    await prisma.mailProcessata.create({
      data: {
        messageId: m.messageId,
        threadId: m.threadId || null,
        mittente: m.mittente,
        oggetto: m.oggettoOriginale,
        categoriaProposta: classificazione.categoria,
        etichettaProposta: calcolaEtichettaProposta(classificazione.categoria, `${m.titolo} ${m.descrizione}`),
        confidenza: classificazione.confidenza,
        binario: "MANUALE",
      },
    });
    return "MANUALE";
  }

  // Ultima chance prima di arrendersi a Incerto: livello 3 della catena, match debole per
  // oggetto normalizzato + mittente. Mai eseguito da solo — genera solo una proposta, sempre
  // a conferma umana ("Collega" o "Crea nuova" dalla schermata di revisione).
  const continuazioneDebole = await trovaContinuazioneDebole(m);
  if (continuazioneDebole) {
    await prisma.mailProcessata.create({
      data: {
        messageId: m.messageId,
        threadId: m.threadId || null,
        mittente: m.mittente,
        oggetto: m.oggettoOriginale,
        categoriaProposta: codificaEntita(continuazioneDebole),
        confidenza: null,
        binario: "PROPOSTA_CONTINUAZIONE",
      },
    });
    return "PROPOSTA_CONTINUAZIONE";
  }

  await prisma.mailProcessata.create({
    data: {
      messageId: m.messageId,
      threadId: m.threadId || null,
      mittente: m.mittente,
      oggetto: m.oggettoOriginale,
      categoriaProposta: classificazione?.categoria ?? null,
      // Anche sotto soglia, un'ipotesi (per quanto debole) resta più utile di un badge vuoto —
      // l'incertezza è già comunicata dal binario INCERTO stesso, non serve azzerare anche questo.
      etichettaProposta: calcolaEtichettaProposta(classificazione?.categoria ?? null, `${m.titolo} ${m.descrizione}`),
      confidenza: classificazione?.confidenza ?? null,
      binario: "INCERTO",
    },
  });
  try {
    await marcaIncerto(m.messageId);
  } catch {
    // Etichetta informativa: un fallimento qui non blocca lo scan, la riga DB resta comunque la fonte di verità.
  }
  return "INCERTO";
}

/**
 * Una pagina di scan del motore (sezione 6): scansiona tutta la casella (non solo le
 * etichette note), salta i messaggi già in MailProcessata (unico segnale di deduplica),
 * classifica i nuovi e scrive la riga corrispondente. Nessuna creazione di entità né
 * etichetta "Importata"/di categoria in questa sessione — vedi Sessione B.
 */
export async function scansionaMail(pageToken?: string, maxResults = 25): Promise<RisultatoScansione> {
  const [{ mails, nextPageToken }, mappaEtichette] = await Promise.all([
    getMailsPaginato(pageToken, maxResults),
    getMappaEtichette(),
  ]);

  const risultato: RisultatoScansione = { processate: 0, automatico: 0, manuale: 0, incerto: 0, nonRilevante: 0, propostaContinuazione: 0, fuoriScope: 0, nextPageToken };

  for (const m of mails) {
    const esistente = await prisma.mailProcessata.findUnique({ where: { messageId: m.messageId } });
    if (esistente) continue;

    const nomiEtichette = m.labelIds.map(id => mappaEtichette.get(id)).filter((n): n is string => !!n);
    const esito = await classificaESalva(m, nomiEtichette);

    risultato.processate++;
    if (esito === "AUTOMATICO") risultato.automatico++;
    else if (esito === "MANUALE") risultato.manuale++;
    else if (esito === "INCERTO") risultato.incerto++;
    else if (esito === "NON_RILEVANTE") risultato.nonRilevante++;
    else if (esito === "PROPOSTA_CONTINUAZIONE") risultato.propostaContinuazione++;
    else risultato.fuoriScope++;
  }

  return risultato;
}

/** true finché nessuna mail è mai stata effettivamente completata con un'azione reale (entità
 * creata o collegata) — usato per forzare la conferma totale al primo giro reale, indipendentemente
 * da quante righe IN_ATTESA uno scan di verifica abbia già scritto.
 *
 * Il filtro `entitaCreataId: { not: null }` è voluto: le righe NON_RILEVANTE raggiungono
 * `esito: COMPLETATO` da sole già in fase di scan (senza mai passare da IN_ATTESA né da una
 * conferma umana, per design — vedi commento su BinarioMail.NON_RILEVANTE in schema.prisma e
 * NOTE-TECNICHE.md). Se contassero, la prima newsletter scansionata sbloccherebbe da sola il
 * binario Automatico prima che Marco abbia mai confermato una vera azione. I match forti di
 * continuazione (Sessione E) restano invece `binario: AUTOMATICO` e valorizzano sempre
 * `entitaCreataId` quando completano: continuano a rispettare il gate come ogni riga Automatico. */
export async function primaEsecuzione(): Promise<boolean> {
  const completate = await prisma.mailProcessata.count({
    where: { esito: "COMPLETATO", entitaCreataId: { not: null } },
  });
  return completate === 0;
}

// categoriaProposta -> gestore. Manuale/Incerto/Proposta continuazione restano sempre a conferma
// umana (Sessione C), non hanno un gestore di esecuzione qui.
const GESTORI_AUTOMATICO: Record<string, (m: MailImport) => Promise<EsitoEsecuzione>> = {
  CONVOCAZIONE_CONSIGLIO: m => eseguiConvocazione(m, "CONVOCAZIONE_CONSIGLIO"),
  CONVOCAZIONE_COMMISSIONE: m => eseguiConvocazione(m, "CONVOCAZIONE_COMMISSIONE"),
  CONVOCAZIONE_GIUNTA: m => eseguiConvocazione(m, "CONVOCAZIONE_GIUNTA"),
  MOZIONE: m => eseguiMozioneOInterrogazione(m, "MOZIONE"),
  INTERROGAZIONE: m => eseguiMozioneOInterrogazione(m, "INTERROGAZIONE"),
  VERBALE_GIUNTA: eseguiVerbaleGiunta,
  GIUSTIFICA: eseguiGiustifica,
  CONTINUAZIONE: eseguiContinuazione,
  DELIBERA_GIUNTA: m => eseguiConvocazione(m, "DELIBERA"),
  DETERMINA_GIUNTA: m => eseguiConvocazione(m, "DETERMINA"),
  ANCI: m => eseguiProgettoVarie(m, "ANCI"),
  REGIONE: m => eseguiProgettoVarie(m, "REGIONE"),
  GOVERNO: m => eseguiProgettoVarie(m, "GOVERNO"),
  // Gestori in entrata (Fase 2 sezione 6.2) — nome esatto del Gestore in DB, non l'etichetta Gmail
  // (casing diverso per alcuni, vedi NOME_GESTORE_ENTRATA in lib/constants.ts).
  GESTORE_ACAM_AMBIENTE: m => eseguiContestazioneGestore(m, "ACAM Ambiente"),
  GESTORE_ACAM_ACQUE: m => eseguiContestazioneGestore(m, "ACAM Acque"),
  GESTORE_ATC_ESERCIZIO: m => eseguiContestazioneGestore(m, "ATC Esercizio"),
  GESTORE_ENEL: m => eseguiContestazioneGestore(m, "Enel"),
  GESTORE_MARIS: m => eseguiContestazioneGestore(m, "Maris"),
  GESTORE_ATO_RIFIUTI: m => eseguiContestazioneGestore(m, "Ato Rifiuti"),
};

export type RisultatoMotore = {
  primaEsecuzione: boolean;
  scansionate: number;
  completati: number;
  inAttesa: number;
  errori: string[];
  // Fase 2 sezione 4: esito del passaggio di riconciliazione, in coda allo stesso giro.
  riconciliazione: { aggiornate: number; conflitti: string[] };
};

// Fase 2 sezione 4: allinea una Pratica o un Progetto quando Marco sposta a mano l'etichetta
// Gmail della mail già processata (es. da "Segnalazioni/Viabilità" a "Segnalazioni/Ambiente", o
// dentro una sotto-etichetta "Risolta" per chiudere una segnalazione). Non viola mai "DB prima di
// Gmail" (regola nata da un incidente reale, vedi NOTE-TECNICHE.md): non crea né cancella
// un'entità, aggiorna solo campi di classificazione/stato su un'entità che esiste già.
async function riconciliaSegnalazione(entitaCreataId: string, nomiEtichette: string[]): Promise<"aggiornata" | "conflitto" | "nessuna"> {
  const praticaId = Number(entitaCreataId);
  if (!Number.isFinite(praticaId)) return "nessuna";
  const pratica = await prisma.pratica.findUnique({ where: { id: praticaId } });
  if (!pratica) return "nessuna"; // entità cancellata nel frattempo, non blocca il resto del giro

  const etichetteSegnalazioni = nomiEtichette.filter(e => e.startsWith("Segnalazioni/"));
  if (!etichetteSegnalazioni.length) return "nessuna";

  // Chiusura manuale (decisione di Marco, 2026-09-15): qualunque sotto-etichetta "Risolta", a
  // qualunque profondità (Segnalazioni/<Delega>/Risolta o Segnalazioni/<Delega>/<sottotema>/
  // Risolta) — Gmail ha già lo stato corretto, qui si allinea solo il DB. Mai richiamare
  // spostaInChiusa: riscriverebbe etichette già a posto.
  if (etichetteSegnalazioni.some(e => e.endsWith("/Risolta"))) {
    if (pratica.stato === "CHIUSA") return "nessuna";
    await prisma.pratica.update({
      where: { id: praticaId },
      data: { stato: "CHIUSA", chiusaAt: new Date(), storico: { create: { statoPrecedente: pratica.stato, statoNuovo: "CHIUSA" } } },
    });
    return "aggiornata";
  }

  // Cambio di delega: tutte le vere deleghe DISTINTE risolte da una qualunque "Segnalazioni/*"
  // (ETICHETTA_DELEGA, stessa tabella di "Deleghe/<nome>"). Le etichette di stato note (Chiusa
  // piatta legacy, In corso) non contano né come delega né come conflitto — la loro semplice
  // presenza accanto a una vera delega non deve mai bloccare l'aggiornamento.
  //
  // Più di UNA delega distinta = stato ambiguo, mai risolto indovinando quale sia quella giusta:
  // trovato dal vivo nel dry-run (2026-09-15) un caso reale di etichetta residua mai ripulita,
  // rimasta da prima dell'introduzione della pulizia automatica (diagnosi 2026-07-25) — un
  // Progetto ANCI portava ancora "Deleghe/Lavori Pubblici" insieme alla vera etichetta corrente.
  // Stesso rischio qui: va trattato come conflitto per revisione manuale, non risolto a caso.
  const delegheTrovate = new Set(
    etichetteSegnalazioni.map(e => e.split("/")[1]).filter((nome): nome is string => nome in ETICHETTA_DELEGA).map(nome => ETICHETTA_DELEGA[nome])
  );
  if (delegheTrovate.size === 0) {
    const soloStatoNoto = etichetteSegnalazioni.every(e => e === "Segnalazioni/Chiusa" || e === "Segnalazioni/In corso");
    return soloStatoNoto ? "nessuna" : "conflitto";
  }
  if (delegheTrovate.size > 1) return "conflitto";

  const [delega] = delegheTrovate;

  // Sotto-tema (Fase 2, 2026-09-15): se tra le etichette "Segnalazioni/<Delega>/<SottoTema>" (non
  // "/Risolta", già gestita sopra) c'è un terzo livello per la delega appena risolta, allinea anche
  // il campo — stesso trova-o-crea-al-volo usato in conferma mail, mai indovinato se più di un nome
  // distinto compare (stesso principio conflict-safety di sopra, ma qui semplicemente non tocca il
  // campo invece di bloccare tutto: la delega resta comunque aggiornabile).
  const nomeEtichettaDelegaGmail = etichetteSegnalazioni.find(e => (ETICHETTA_DELEGA[e.split("/")[1]] ?? undefined) === delega)!.split("/")[1];
  const nomiSottoTema = new Set(
    etichetteSegnalazioni
      .filter(e => e.split("/")[1] === nomeEtichettaDelegaGmail)
      .map(e => e.split("/")[2])
      .filter((n): n is string => !!n)
  );
  const sottoTemaIdRisolto = nomiSottoTema.size === 1 ? (await trovaOCreaSottoTema(delega, [...nomiSottoTema][0])).id : undefined;

  const delegaCambiata = delega !== pratica.delega;
  const sottoTemaCambiato = sottoTemaIdRisolto !== undefined && sottoTemaIdRisolto !== pratica.sottoTemaId;
  if (!delegaCambiata && !sottoTemaCambiato) return "nessuna";

  await prisma.pratica.update({
    where: { id: praticaId },
    data: {
      ...(delegaCambiata ? { delega } : {}),
      ...(sottoTemaCambiato ? { sottoTemaId: sottoTemaIdRisolto } : {}),
    },
  });
  return "aggiornata";
}

async function riconciliaProgetto(entitaCreataId: string, nomiEtichette: string[]): Promise<"aggiornata" | "conflitto" | "nessuna"> {
  const progetto = await prisma.progetto.findUnique({ where: { id: entitaCreataId }, include: { enteVario: true } });
  if (!progetto) return "nessuna";

  const etichetteDelega = nomiEtichette.filter(e => e.startsWith("Deleghe/"));
  const etichetteIstituzioni = nomiEtichette.filter(e => e.startsWith("Istituzioni/"));

  // Presenza contemporanea di entrambi gli alberi: stato strutturalmente ambiguo (un Progetto ha
  // o una vera delega o un ente, mai entrambi) — quasi sempre un'etichetta residua mai ripulita,
  // non un cambio voluto. Caso reale trovato dal vivo nel dry-run (2026-09-15): un Progetto ANCI
  // portava ancora "Deleghe/Lavori Pubblici" da prima dell'introduzione della pulizia automatica
  // (diagnosi 2026-07-25). Mai indovinare quale sia quella corretta — conflitto, non un update.
  if (etichetteDelega.length && etichetteIstituzioni.length) return "conflitto";

  if (etichetteDelega.length) {
    const deleghe = new Set(etichetteDelega.map(e => e.split("/")[1]).filter((nome): nome is string => nome in ETICHETTA_DELEGA).map(nome => ETICHETTA_DELEGA[nome]));
    if (deleghe.size === 0) return "conflitto";
    if (deleghe.size > 1) return "conflitto"; // più di una delega distinta, stesso principio sopra
    const [delega] = deleghe;
    if (delega === progetto.delega) return "nessuna";
    await prisma.progetto.update({ where: { id: progetto.id }, data: { delega, enteVarioId: null } });
    return "aggiornata";
  }

  // "Istituzioni/<nome>" (chiamata "Varie" fino al 2026-09-15): il nome può essere qualunque
  // EnteVario, anche uno aggiunto al volo — trova o crea, mai da inventare un ente inesistente.
  if (etichetteIstituzioni.length) {
    const nomiEnte = new Set(etichetteIstituzioni.map(e => e.split("/")[1]).filter((n): n is string => !!n));
    if (nomiEnte.size === 0) return "conflitto";
    if (nomiEnte.size > 1) return "conflitto";
    const [nomeEnte] = nomiEnte;
    if (nomeEnte === progetto.enteVario?.nome) return "nessuna";
    const ente = await trovaOCreaEnteVario(nomeEnte);
    await prisma.progetto.update({ where: { id: progetto.id }, data: { enteVarioId: ente.id, delega: null } });
    return "aggiornata";
  }

  return "nessuna";
}

// Introdotta con un tetto basso (maxRighe) di proposito: prima osservata su volumi contenuti,
// poi eventualmente allargata — stesso approccio prudente già usato per il binario Automatico
// alla sua introduzione. Non tocca mai MailProcessata.esito né entitaCreataId: quei campi restano
// quelli della creazione originale, questa è un canale a parte.
// Default abbassato a 20 (non i 50 della spec originale): verificato dal vivo con un dry-run
// (2026-09-15) che una singola chiamata gmail.users.messages.get(format:"full") per riga, nello
// stesso giro cron che ha già fatto scan+esecuzione automatica, può avvicinarsi al limite di
// quota Gmail "Units per minute per user" — recuperato in più giri successivi, non serve
// near-realtime (confermato da Marco), meglio restare sotto quota che processare tutto in un colpo.
export async function riconciliaEtichette(maxRighe = 20): Promise<{ aggiornate: number; conflitti: string[] }> {
  const righe = await prisma.mailProcessata.findMany({
    where: { esito: "COMPLETATO", entitaCreataId: { not: null }, categoriaProposta: { in: ["segnalazione", "progetto"] } },
    orderBy: { updatedAt: "asc" },
    take: maxRighe,
  });
  if (!righe.length) return { aggiornate: 0, conflitti: [] };

  const mappaEtichette = await getMappaEtichette();
  let aggiornate = 0;
  const conflitti: string[] = [];

  for (const riga of righe) {
    if (!riga.entitaCreataId) continue;
    const mail = await getMailPerId(riga.messageId);
    if (!mail) continue; // mail cancellata/spostata altrove — non blocca il resto del giro

    const nomiEtichette = mail.labelIds.map(id => mappaEtichette.get(id)).filter((n): n is string => !!n);

    const esito = riga.categoriaProposta === "segnalazione"
      ? await riconciliaSegnalazione(riga.entitaCreataId, nomiEtichette)
      : await riconciliaProgetto(riga.entitaCreataId, nomiEtichette);

    if (esito === "aggiornata") {
      aggiornate++;
      // updatedAt si aggiorna da solo con l'update sopra — la prossima riconciliazione non la
      // rivede subito in cima alla coda (orderBy updatedAt asc), stesso principio del "toccato di
      // recente passa in fondo" già implicito nel resto del motore.
    } else if (esito === "conflitto") {
      conflitti.push(`${riga.messageId}: etichetta non riconosciuta, revisione manuale`);
    }
  }

  return { aggiornate, conflitti };
}

/**
 * Un giro completo del motore (chiamato dal cron o a mano): drena il pregresso non ancora in
 * MailProcessata (a blocchi limitati, non tutto in un colpo — stesso motivo della paginazione
 * a monte) poi, se non è la prima esecuzione, esegue le righe Automatico rimaste IN_ATTESA.
 * Alla prima esecuzione (nessuna riga mai COMPLETATA) tutto resta IN_ATTESA, anche l'Automatico:
 * Marco deve confermare almeno una volta dalla revisione (Sessione C) prima che il binario
 * automatico inizi davvero a funzionare senza conferma.
 */
export async function eseguiMotoreMail(maxPagineScan = 20, maxEsecuzioni = 15): Promise<RisultatoMotore> {
  let scansionate = 0;
  let pageToken: string | undefined;
  for (let i = 0; i < maxPagineScan; i++) {
    const r = await scansionaMail(pageToken, 25);
    scansionate += r.processate;
    pageToken = r.nextPageToken;
    if (!pageToken) break;
  }

  const primaVolta = await primaEsecuzione();
  let completati = 0;
  let inAttesa = 0;
  const errori: string[] = [];

  if (primaVolta) {
    inAttesa = await prisma.mailProcessata.count({ where: { binario: "AUTOMATICO", esito: "IN_ATTESA" } });
  } else {
    const daEseguire = await prisma.mailProcessata.findMany({
      where: { binario: "AUTOMATICO", esito: "IN_ATTESA" },
      take: maxEsecuzioni,
    });

    for (const riga of daEseguire) {
      const gestore = riga.categoriaProposta ? GESTORI_AUTOMATICO[riga.categoriaProposta] : undefined;
      if (!gestore) { inAttesa++; continue; } // non dovrebbe succedere, ma non blocca il resto del giro

      const mail = await getMailPerId(riga.messageId);
      if (!mail) {
        errori.push(`${riga.messageId}: mail non trovata su Gmail`);
        await prisma.mailProcessata.update({ where: { id: riga.id }, data: { esito: "ERRORE" } });
        continue;
      }

      // Prima di creare una nuova entità senza supervisione diretta: se il messaggio fa parte di
      // un thread con un precedente mai processato, non swappare l'origine in silenzio — si
      // ferma solo questa riga (stesso trattamento già riservato al caso ODG ambiguo nello zip),
      // il resto del ciclo prosegue. CONTINUAZIONE è esclusa: lì ci si aggancia a un'entità già
      // esistente, non se ne crea una nuova — il caso descritto non si applica (diagnosi 2026-07-25).
      if (riga.categoriaProposta !== "CONTINUAZIONE") {
        const messaggioPrecedente = await trovaMessaggioPrecedenteNonProcessato(mail);
        if (messaggioPrecedente) {
          inAttesa++;
          continue;
        }
      }

      const esito = await gestore(mail);

      if (esito.esito === "COMPLETATO") {
        // Regola non negoziabile: il DB prima, le etichette Gmail solo dopo.
        await prisma.mailProcessata.update({
          where: { id: riga.id },
          data: { esito: "COMPLETATO", entitaCreataId: esito.entitaId ?? null },
        });
        try {
          await marcaImportata(riga.messageId);
        } catch {
          // L'entità è comunque creata e COMPLETATO è già scritto — l'etichetta è solo di comodo,
          // un suo fallimento non deve far sembrare fallita l'importazione.
        }
        // eseguiContinuazione (categoriaProposta "CONTINUAZIONE") calcola l'etichetta lui stesso,
        // perché dipende dall'entità trovata (segnalazione/progetto+delega/contestazione), non da
        // una lookup generica sul categoriaProposta della riga.
        const nomeEtichetta = esito.etichetta ?? (riga.categoriaProposta ? etichettaPerCategoria(riga.categoriaProposta) : null);
        if (nomeEtichetta) {
          // Solo dopo l'etichetta con successo: fuori INBOX, non più da leggere (sessione 2,
          // mail). Se l'etichetta fallisce, applicaEtichettaEArchivia non tenta nemmeno
          // l'archiviazione — la mail resta in INBOX, ritrovabile.
          try {
            await applicaEtichettaEArchivia(riga.messageId, nomeEtichetta);
          } catch {
            // Reso visibile, non solo tollerato: stesso principio dei contatori Bandi.
            await prisma.mailProcessata.update({ where: { id: riga.id }, data: { archiviazioneFallita: true } }).catch(() => {});
          }
        }
        completati++;
      } else if (esito.esito === "AMBIGUO") {
        inAttesa++; // resta IN_ATTESA su MailProcessata, ripreso dalla revisione manuale (Sessione C)
      } else {
        await prisma.mailProcessata.update({ where: { id: riga.id }, data: { esito: "ERRORE" } });
        errori.push(`${riga.messageId}: ${esito.errore}`);
      }
    }
  }

  // Fase 2 sezione 4: sempre eseguita, anche alla prima esecuzione — non crea né cancella
  // un'entità (aggiorna solo campi di classificazione/stato su entità già confermate), quindi non
  // è soggetta al gate "prima esecuzione" che protegge solo le azioni di creazione.
  const riconciliazione = await riconciliaEtichette();

  return { primaEsecuzione: primaVolta, scansionate, completati, inAttesa, errori, riconciliazione };
}
