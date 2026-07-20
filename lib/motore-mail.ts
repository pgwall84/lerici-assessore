import { prisma } from "@/lib/prisma";
import { getMailsPaginato, getMappaEtichette, getMailPerId, marcaImportata, marcaIncerto, marcaNonRilevante, applicaEtichetta, type MailImport } from "@/lib/gmail";
import { classificaMail } from "@/lib/claude";
import { TASSONOMIA_MAIL, categoriaProposta, etichettaPerCategoria } from "@/lib/constants";
import { eseguiConvocazione, eseguiMozioneOInterrogazione, eseguiVerbaleGiunta, eseguiGiustifica, eseguiContinuazione, type EsitoEsecuzione } from "@/lib/import-automatico";
import { trovaContinuazioneForte, trovaContinuazioneDebole, codificaEntita } from "@/lib/continuazione";

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

export function trovaVoceTassonomia(nomiEtichette: string[]) {
  for (const nome of nomiEtichette) {
    const voce = TASSONOMIA_MAIL[nome];
    if (voce) return voce;
  }
  return null;
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

  if (voceNota && "fuoriScope" in voceNota) {
    return "FUORI_SCOPE";
  }

  if (voceNota) {
    await prisma.mailProcessata.create({
      data: {
        messageId: m.messageId,
        threadId: m.threadId || null,
        mittente: m.mittente,
        oggetto: m.oggettoOriginale,
        categoriaProposta: categoriaProposta(voceNota),
        confidenza: 1,
        binario: voceNota.binario,
      },
    });
    return voceNota.binario;
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
      await prisma.mailProcessata.create({
        data: {
          messageId: m.messageId,
          threadId: m.threadId || null,
          mittente: m.mittente,
          oggetto: m.oggettoOriginale,
          categoriaProposta: classificazione.categoria,
          confidenza: classificazione.confidenza,
          binario: "NON_RILEVANTE",
          esito: "COMPLETATO",
        },
      });
      try {
        await marcaNonRilevante(m.messageId);
      } catch {
        // Etichetta informativa: un fallimento qui non blocca lo scan, la riga DB resta comunque la fonte di verità.
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

// categoriaProposta -> gestore. Solo le 8 combinazioni del binario Automatico (le 7 già note +
// CONTINUAZIONE): Manuale/Incerto/Proposta continuazione restano sempre a conferma umana
// (Sessione C), non hanno un gestore di esecuzione qui.
const GESTORI_AUTOMATICO: Record<string, (m: MailImport) => Promise<EsitoEsecuzione>> = {
  CONVOCAZIONE_CONSIGLIO: m => eseguiConvocazione(m, "CONVOCAZIONE_CONSIGLIO"),
  CONVOCAZIONE_COMMISSIONE: m => eseguiConvocazione(m, "CONVOCAZIONE_COMMISSIONE"),
  CONVOCAZIONE_GIUNTA: m => eseguiConvocazione(m, "CONVOCAZIONE_GIUNTA"),
  MOZIONE: m => eseguiMozioneOInterrogazione(m, "MOZIONE"),
  INTERROGAZIONE: m => eseguiMozioneOInterrogazione(m, "INTERROGAZIONE"),
  VERBALE_GIUNTA: eseguiVerbaleGiunta,
  GIUSTIFICA: eseguiGiustifica,
  CONTINUAZIONE: eseguiContinuazione,
};

export type RisultatoMotore = {
  primaEsecuzione: boolean;
  scansionate: number;
  completati: number;
  inAttesa: number;
  errori: string[];
};

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

      const esito = await gestore(mail);

      if (esito.esito === "COMPLETATO") {
        // Regola non negoziabile: il DB prima, le etichette Gmail solo dopo.
        await prisma.mailProcessata.update({
          where: { id: riga.id },
          data: { esito: "COMPLETATO", entitaCreataId: esito.entitaId },
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
          try { await applicaEtichetta(riga.messageId, nomeEtichetta); } catch { /* idem sopra */ }
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

  return { primaEsecuzione: primaVolta, scansionate, completati, inAttesa, errori };
}
