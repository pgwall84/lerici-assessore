import { Delega, EsitoContestazione, Priorita, StatoAtto, StatoPratica, StatoProgetto, StatoRiunione, TipoAtto, TipoPratica, TipoProgetto } from "@prisma/client";

export const DELEGHE_LABEL: Record<Delega, string> = {
  VIABILITA: "Viabilità",
  AMBIENTE: "Ambiente",
  RIFIUTI: "Ciclo Rifiuti",
  SISTEMA_IDRICO: "Sistema Idrico",
  ILLUMINAZIONE: "Illuminazione Pubblica",
  ACCESSIBILITA: "Accessibilità",
  CIMITERI: "Cimiteri",
  POLITICHE_ABITATIVE: "Politiche Abitative",
  DIGITALIZZAZIONE: "Digitalizzazione",
  MANUTENZIONE_PATRIMONIO: "Manutenzione Patrimonio",
};

// Nome sotto-etichetta Gmail "Deleghe/…" -> enum Delega. Verificato a mano contro le
// etichette reali: 4 nomi non coincidono col nome dell'enum (RIFIUTI/Ciclo Rifiuti,
// SISTEMA_IDRICO/Idrico, ILLUMINAZIONE/Pubblica Illuminazione, MANUTENZIONE_PATRIMONIO/Lavori Pubblici).
export const ETICHETTA_DELEGA: Record<string, Delega> = {
  "Accessibilità": "ACCESSIBILITA",
  "Ambiente": "AMBIENTE",
  "Ciclo Rifiuti": "RIFIUTI",
  "Cimiteri": "CIMITERI",
  "Digitalizzazione": "DIGITALIZZAZIONE",
  "Idrico": "SISTEMA_IDRICO",
  "Lavori Pubblici": "MANUTENZIONE_PATRIMONIO",
  "Politiche Abitative": "POLITICHE_ABITATIVE",
  "Pubblica Illuminazione": "ILLUMINAZIONE",
  "Viabilità": "VIABILITA",
};

export const TIPO_LABEL: Record<TipoPratica, string> = {
  SEGNALAZIONE: "Segnalazione cittadino",
  MIA_IDEA: "Mia idea",
  PROGETTO: "Progetto comunale",
};

export const STATO_LABEL: Record<StatoPratica, string> = {
  APERTA: "Aperta",
  IN_CORSO: "In corso",
  CHIUSA: "Chiusa",
  SOSPESA: "Sospesa",
  APPUNTO: "Appunto",
  IN_VALUTAZIONE: "In valutazione",
  PROMOSSA: "Promossa a progetto",
  ARCHIVIATA: "Archiviata",
};

// Stati validi per tipo
export const STATI_PER_TIPO: Record<TipoPratica, StatoPratica[]> = {
  SEGNALAZIONE: ["APERTA", "IN_CORSO", "CHIUSA", "SOSPESA"],
  MIA_IDEA: ["IN_VALUTAZIONE", "PROMOSSA", "ARCHIVIATA"],
  PROGETTO: ["IN_VALUTAZIONE", "IN_CORSO", "CHIUSA", "SOSPESA"],
};

// Stato iniziale per tipo
export const STATO_INIZIALE: Record<TipoPratica, StatoPratica> = {
  SEGNALAZIONE: "APERTA",
  MIA_IDEA: "IN_VALUTAZIONE",
  PROGETTO: "IN_VALUTAZIONE",
};

export const STATO_COLORE: Record<StatoPratica, string> = {
  APERTA: "bg-blue-100 text-blue-800",
  IN_CORSO: "bg-yellow-100 text-yellow-800",
  CHIUSA: "bg-green-100 text-green-800",
  SOSPESA: "bg-gray-100 text-gray-600",
  APPUNTO: "bg-purple-100 text-purple-800",
  IN_VALUTAZIONE: "bg-orange-100 text-orange-800",
  PROMOSSA: "bg-teal-100 text-teal-800",
  ARCHIVIATA: "bg-gray-100 text-gray-500",
};

export const PRIORITA_LABEL: Record<Priorita, string> = {
  ALTA: "Alta",
  MEDIA: "Media",
  BASSA: "Bassa",
};

export const PRIORITA_COLORE: Record<Priorita, string> = {
  ALTA: "bg-red-100 text-red-700",
  MEDIA: "bg-yellow-100 text-yellow-700",
  BASSA: "bg-gray-100 text-gray-500",
};

// APPUNTO incluso qui (trovato in Sessione 3 come stato orfano — non coperto né da Operativa né
// da Archivio, sparirebbe da ogni vista se mai assegnato a una Pratica): coerente trattarlo come
// una nota ancora aperta, non archiviata.
export const STATI_OPERATIVA: StatoPratica[] = ["APERTA", "IN_CORSO", "IN_VALUTAZIONE", "PROMOSSA", "APPUNTO"];
export const STATI_ARCHIVIO: StatoPratica[] = ["CHIUSA", "SOSPESA", "ARCHIVIATA"];

export const TIPO_COLORE: Record<TipoPratica, string> = {
  SEGNALAZIONE: "bg-red-100 text-red-700",
  MIA_IDEA: "bg-purple-100 text-purple-700",
  PROGETTO: "bg-blue-100 text-blue-700",
};

// Sottocategorie rapide per delega — usate nel form di inserimento come scorciatoie
export const SOTTOCATEGORIE: Partial<Record<Delega, string[]>> = {
  AMBIENTE: [
    "Mancato ritiro rifiuti",
    "Problema topi / derattizzazione",
    "Abbandono rifiuti",
    "Discarica abusiva",
    "Problema cinghiali",
    "Inquinamento acque",
    "Segnalazione odori",
    "Richiesta spazzamento",
    "Cestino pieno",
  ],
  RIFIUTI: [
    "Mancato ritiro rifiuti",
    "Bidone danneggiato / mancante",
    "Etichette bidoni da aggiornare",
    "Punto raccolta da sistemare",
    "Richiesta compostiera",
    "Raccolta ingombranti",
  ],
  VIABILITA: [
    "Buca / avvallamento stradale",
    "Segnaletica danneggiata / mancante",
    "Guard rail da riparare",
    "Parcheggio abusivo ricorrente",
    "Dosso / attraversamento pedonale",
    "Marciapiede dissestato",
    "Richiesta specchio stradale",
    "Albero / detrito in carreggiata",
  ],
  ILLUMINAZIONE: [
    "Lampione spento",
    "Lampione intermittente",
    "Zona buia / nuova illuminazione",
    "Cavo / palo danneggiato",
  ],
  SISTEMA_IDRICO: [
    "Perdita idrica su strada",
    "Problemi pressione acqua",
    "Canale / fosso ostruito",
    "Allagamento ricorrente",
    "Tombino ostruito / rotto",
  ],
  ACCESSIBILITA: [
    "Barriera architettonica",
    "Scivolo / rampa mancante",
    "Marciapiede non accessibile",
    "Parcheggio disabili occupato / mancante",
    "Ascensore / montascale pubblico guasto",
  ],
  CIMITERI: [
    "Manutenzione vialetti",
    "Illuminazione cimitero",
    "Problema loculo / sepoltura",
    "Pulizia area cimiteriale",
    "Richiesta informazioni concessioni",
  ],
  MANUTENZIONE_PATRIMONIO: [
    "Edificio pubblico da riparare",
    "Infiltrazioni / umidità",
    "Infissi / porte rotte",
    "Parco / area verde da sistemare",
    "Recinzione danneggiata",
    "Impianto sportivo da riparare",
    "Spogliatoio da riqualificare",
    "Paletto mancante / rotto",
  ],
  POLITICHE_ABITATIVE: [
    "Richiesta alloggio ERP",
    "Problema alloggio comunale",
    "Morosità / occupazione abusiva",
    "Manutenzione alloggio comunale",
  ],
  DIGITALIZZAZIONE: [
    "Richiesta servizio digitale",
    "Problema accesso portale comunale",
    "Connettività / WiFi pubblico",
    "Proposta nuovo servizio online",
  ],
};

// --- Attività Politico-Amministrativa (Atti) ---

export const TIPO_ATTO_LABEL: Record<TipoAtto, string> = {
  CONVOCAZIONE_GIUNTA: "Convocazione Giunta",
  CONVOCAZIONE_CONSIGLIO: "Convocazione Consiglio",
  CONVOCAZIONE_COMMISSIONE: "Convocazione Commissione",
  MOZIONE: "Mozione",
  INTERROGAZIONE: "Interrogazione",
  DELIBERA: "Delibera di Giunta",
  DETERMINA: "Determina di Giunta",
  DUP: "DUP",
  BILANCIO: "Bilancio",
};

// Etichette brevi per la sidebar delle sotto-categorie (stile Deleghe di Progetti).
export const TIPO_ATTO_LABEL_BREVE: Record<TipoAtto, string> = {
  CONVOCAZIONE_CONSIGLIO: "Consiglio Comunale",
  CONVOCAZIONE_COMMISSIONE: "Commissioni",
  MOZIONE: "Mozioni",
  INTERROGAZIONE: "Interrogazioni",
  CONVOCAZIONE_GIUNTA: "Giunta",
  DELIBERA: "Delibere",
  DETERMINA: "Determine",
  DUP: "DUP",
  BILANCIO: "Bilancio",
};

export const TIPO_ATTO_ICONA: Record<TipoAtto, string> = {
  CONVOCAZIONE_GIUNTA: "🏛️",
  CONVOCAZIONE_CONSIGLIO: "🏛️",
  CONVOCAZIONE_COMMISSIONE: "🗂️",
  MOZIONE: "📄",
  INTERROGAZIONE: "❓",
  DELIBERA: "📜",
  DETERMINA: "📑",
  DUP: "📊",
  BILANCIO: "💰",
};

export const STATO_ATTO_LABEL: Record<StatoAtto, string> = {
  DA_ESAMINARE: "Da esaminare",
  ESAMINATO: "Esaminato",
  RISPOSTO: "Risposto",
  ARCHIVIATO: "Archiviato",
};

export const STATO_ATTO_COLORE: Record<StatoAtto, string> = {
  DA_ESAMINARE: "bg-yellow-100 text-yellow-800",
  ESAMINATO: "bg-blue-100 text-blue-700",
  RISPOSTO: "bg-green-100 text-green-800",
  ARCHIVIATO: "bg-gray-100 text-gray-500",
};

export const STATI_ATTO_OPERATIVA: StatoAtto[] = ["DA_ESAMINARE", "ESAMINATO"];
export const STATI_ATTO_ARCHIVIO: StatoAtto[] = ["ARCHIVIATO", "RISPOSTO"];

// --- Riunioni ---

export const STATO_RIUNIONE_LABEL: Record<StatoRiunione, string> = {
  IN_PREPARAZIONE: "In preparazione",
  IN_CORSO: "In corso",
  CONCLUSA: "Conclusa",
};

export const STATO_RIUNIONE_COLORE: Record<StatoRiunione, string> = {
  IN_PREPARAZIONE: "bg-gray-100 text-gray-600",
  IN_CORSO: "bg-yellow-100 text-yellow-800",
  CONCLUSA: "bg-green-100 text-green-800",
};

export const STATI_RIUNIONE_OPERATIVA: StatoRiunione[] = ["IN_PREPARAZIONE", "IN_CORSO"];
export const STATI_RIUNIONE_ARCHIVIO: StatoRiunione[] = ["CONCLUSA"];

// --- Progetti ---

export const STATO_PROGETTO_LABEL: Record<StatoProgetto, string> = {
  IN_CORSO: "In corso",
  SOSPESO: "Sospeso",
  CONCLUSO: "Concluso",
  ARCHIVIATO: "Archiviato",
};

export const STATO_PROGETTO_COLORE: Record<StatoProgetto, string> = {
  IN_CORSO: "bg-yellow-100 text-yellow-800",
  SOSPESO: "bg-gray-100 text-gray-600",
  CONCLUSO: "bg-green-100 text-green-800",
  ARCHIVIATO: "bg-gray-100 text-gray-500",
};

export const STATI_PROGETTO_OPERATIVA: StatoProgetto[] = ["IN_CORSO", "SOSPESO"];
export const STATI_PROGETTO_ARCHIVIO: StatoProgetto[] = ["CONCLUSO", "ARCHIVIATO"];

// --- Contestazioni ---

export const ESITO_CONTESTAZIONE_LABEL: Record<EsitoContestazione, string> = {
  IN_ATTESA: "In attesa",
  RISOLTO: "Risolto",
  RESPINTO: "Respinto",
  SENZA_RISPOSTA: "Senza risposta",
};

export const ESITO_CONTESTAZIONE_COLORE: Record<EsitoContestazione, string> = {
  IN_ATTESA: "bg-yellow-100 text-yellow-800",
  RISOLTO: "bg-green-100 text-green-800",
  RESPINTO: "bg-red-50 text-red-600",
  SENZA_RISPOSTA: "bg-gray-100 text-gray-500",
};

export const ESITI_CONTESTAZIONE_OPERATIVA: EsitoContestazione[] = ["IN_ATTESA"];
export const ESITI_CONTESTAZIONE_ARCHIVIO: EsitoContestazione[] = ["RISOLTO", "RESPINTO", "SENZA_RISPOSTA"];

// Progetto vs Attività: stesso modello, stesso diario/documenti/responsabile — solo un badge/filtro
// diverso in UI. Progetto = strutturato/duraturo, Attività = intervento tecnico puntuale.
export const TIPO_PROGETTO_LABEL: Record<TipoProgetto, string> = {
  PROGETTO: "Progetto",
  ATTIVITA: "Attività",
};

export const TIPO_PROGETTO_COLORE: Record<TipoProgetto, string> = {
  PROGETTO: "bg-blue-100 text-blue-700",
  ATTIVITA: "bg-teal-100 text-teal-700",
};

export const TIPO_PROGETTO_ICONA: Record<TipoProgetto, string> = {
  PROGETTO: "📁",
  ATTIVITA: "🔧",
};

// "Varie" (evolutiva 2026-07-25, da enum a modello EnteVario in Fase 2 sezione 5): usata al posto
// della delega quando un Progetto non ne ha una vera — comunicazioni istituzionali/enti esterni
// instradati per dominio mittente o senza un segnale affidabile (Comunicazioni). Un solo colore
// per tutti (prima un colore per valore enum, non più possibile con un elenco aperto di enti).
export const ENTE_VARIO_COLORE = "bg-indigo-100 text-indigo-700";

// Nomi fissi noti al codice (istradati per dominio mittente, vedi categoriaVariaPerDominio in
// lib/classificatore.ts) — usati solo per ricostruire l'etichetta "Varie/<nome>" quando la
// categoria arriva come stringa fissa ANCI/REGIONE/GOVERNO, non per un elenco chiuso di enti.
export const NOME_ENTE_FISSO: Record<"ANCI" | "REGIONE" | "GOVERNO", string> = {
  ANCI: "ANCI",
  REGIONE: "Regione",
  GOVERNO: "Governo",
};

// Nomi Gestore per le categorie fisse istradate per indirizzo mittente esatto (Fase 2 sezione
// 6.2, vedi categoriaGestoreEntrataPerIndirizzo in lib/classificatore.ts) — stessi nomi etichetta
// "Gestori/<nome>" già confermati da Marco per la sezione 6.1, non sempre identici al campo
// "nome" del modello Gestore in DB (es. "Acam Ambiente" qui vs "ACAM Ambiente" in DB).
export const NOME_GESTORE_ENTRATA: Record<string, string> = {
  GESTORE_ACAM_AMBIENTE: "Acam Ambiente",
  GESTORE_ACAM_ACQUE: "Acam Acque",
  GESTORE_ATC_ESERCIZIO: "ATC esercizio",
  GESTORE_ENEL: "Enel",
  GESTORE_MARIS: "Maris",
  GESTORE_ATO_RIFIUTI: "Ato Rifiuti",
};

// --- Motore di scansione mail (sezione 6 spec) ---

// Etichetta Gmail -> regola di classificazione. Copre esattamente le stesse etichette già
// consumate oggi da import-mail/import-automatico (vedi lib/import-automatico.ts e
// app/api/import-mail/route.ts) + quelle che riflettono solo uno stato già gestito altrove
// (Segnalazioni/Chiusa, Segnalazioni/In corso) — nessuna delle due va classificata.
// Qualunque etichetta NON presente qui (o sotto-etichetta di un ramo noto non mappata) finisce
// in binario INCERTO dopo il tentativo di classificazione AI.
export type VoceTassonomiaMail =
  | { fuoriScope: true }
  | { binario: "AUTOMATICO"; categoria: "atto"; tipo: TipoAtto }
  | { binario: "AUTOMATICO"; categoria: "VERBALE_GIUNTA" }
  | { binario: "AUTOMATICO"; categoria: "GIUSTIFICA" }
  // Crea un vero Atto (tipo DELIBERA/DETERMINA) via eseguiConvocazione, stessa pipeline delle
  // Convocazioni — evolutiva 2026-07-26, prima "solo archiviazione" senza entità. Stessa
  // affidabilità di Consiglio/Giunta/Giustifica (etichetta Gmail dedicata), quindi stesso
  // binario AUTOMATICO — passa dal gate primaEsecuzione() come le altre, non lo salta come
  // NON_RILEVANTE.
  | { binario: "AUTOMATICO"; categoria: "DELIBERA_GIUNTA" }
  | { binario: "AUTOMATICO"; categoria: "DETERMINA_GIUNTA" }
  | { binario: "MANUALE"; categoria: "segnalazione" }
  | { binario: "MANUALE"; categoria: "progetto"; delega: Delega }
  | { binario: "MANUALE"; categoria: "contestazione" };

export const TASSONOMIA_MAIL: Record<string, VoceTassonomiaMail> = {
  "Consiglio Comunale": { binario: "AUTOMATICO", categoria: "atto", tipo: "CONVOCAZIONE_CONSIGLIO" },
  "Consiglio Comunale/Commissioni": { binario: "AUTOMATICO", categoria: "atto", tipo: "CONVOCAZIONE_COMMISSIONE" },
  "Consiglio Comunale/Interrogazioni": { binario: "AUTOMATICO", categoria: "atto", tipo: "INTERROGAZIONE" },
  "Consiglio Comunale/Mozioni": { binario: "AUTOMATICO", categoria: "atto", tipo: "MOZIONE" },
  "Giunta/Convocazioni": { binario: "AUTOMATICO", categoria: "atto", tipo: "CONVOCAZIONE_GIUNTA" },
  "Giunta/Verbali": { binario: "AUTOMATICO", categoria: "VERBALE_GIUNTA" },
  "Giunta/Delibere": { binario: "AUTOMATICO", categoria: "DELIBERA_GIUNTA" },
  "Giunta/Determine": { binario: "AUTOMATICO", categoria: "DETERMINA_GIUNTA" },
  "Giustifica": { binario: "AUTOMATICO", categoria: "GIUSTIFICA" },
  // "Segnalazioni" deliberatamente ESCLUSA da qui (rimossa 2026-07-22): un filtro Gmail
  // dell'utente la applica troppo largamente, catturando mail che non sono segnalazioni. A
  // differenza delle altre etichette di questa tassonomia (confermate affidabili), non va più
  // trattata come segnale ad alta confidenza che salta la classificazione — una mail con questa
  // etichetta passa dal normale flusso regole+AI, come se non avesse etichetta. La direzione
  // inversa (etichettaPerCategoria("segnalazione") -> "Segnalazioni", per riscrivere l'etichetta
  // a conferma avvenuta) resta invariata: qui sotto si tratta solo della lettura in ingresso.
  "Segnalazioni/Chiusa": { fuoriScope: true },
  "Segnalazioni/In corso": { fuoriScope: true },
  "Contestazioni": { binario: "MANUALE", categoria: "contestazione" },
  ...Object.fromEntries(
    Object.entries(ETICHETTA_DELEGA).map(([nomeEtichetta, delega]) => [
      `Deleghe/${nomeEtichetta}`,
      { binario: "MANUALE", categoria: "progetto", delega } as VoceTassonomiaMail,
    ])
  ),
};

// Stringa da persistere in MailProcessata.categoriaProposta: per gli atti usa il TipoAtto
// specifico (non il generico "atto"), altrimenti in Sessione B non si saprebbe più quale
// gestore invocare (Consiglio? Giunta? Mozione?) senza ri-derivarlo dalle etichette.
export function categoriaProposta(voce: Exclude<VoceTassonomiaMail, { fuoriScope: true }>): string {
  return "tipo" in voce ? voce.tipo : voce.categoria;
}

// Inverso di categoriaProposta(): dalla categoria confermata (+ delega per "progetto") risale
// al nome dell'etichetta Gmail da scrivere — serve sia quando l'etichetta era già presente
// all'origine (per riscriverla comunque, idempotente) sia quando la categoria è stata dedotta
// da zero (AI o scelta manuale su Incerto) e l'etichetta non esiste ancora su Gmail.
// Nome esatto della sotto-etichetta Gmail per una delega — stessa tabella (ETICHETTA_DELEGA) usata
// da "Deleghe/<nome>", non DELEGHE_LABEL: verificato in fase di implementazione (Fase 2 sezione 3)
// che i due non coincidono per 3 deleghe su 10 (Idrico, Pubblica Illuminazione, Lavori Pubblici —
// DELEGHE_LABEL è pensata per la UI, non per i nomi reali delle etichette). Un'unica fonte per
// entrambi gli alberi "Deleghe/" e "Segnalazioni/", come richiesto dalla spec.
function nomeEtichettaDelega(delega: Delega): string | undefined {
  return Object.entries(ETICHETTA_DELEGA).find(([, d]) => d === delega)?.[0];
}

// "Segnalazioni/<Delega>" — unica fonte per etichettaPerCategoria e etichettaSegnalazioneRisolta
// sotto, mai due derivazioni parallele dello stesso nome.
export function etichettaSegnalazioneDelega(delega: Delega): string {
  const nome = nomeEtichettaDelega(delega);
  return nome ? `Segnalazioni/${nome}` : "Segnalazioni";
}

// Sotto-etichetta di chiusura per delega (decisione di Marco, 2026-09-15): sostituisce la vecchia
// "Segnalazioni/Chiusa" piatta — quando il tool chiude una Pratica, la sposta in
// "Segnalazioni/<Delega>/Risolta" invece che in un'unica etichetta di stato indistinta, così
// resta filtrabile per delega anche da chiusa. Fallback sulla vecchia piatta solo in caso
// impossibile (delega non mappata — non dovrebbe mai succedere, Delega è un enum chiuso).
export function etichettaSegnalazioneRisolta(delega: Delega): string {
  const nome = nomeEtichettaDelega(delega);
  return nome ? `Segnalazioni/${nome}/Risolta` : "Segnalazioni/Chiusa";
}

export function etichettaPerCategoria(categoria: string, delega?: Delega, enteNome?: string, sottoTemaNome?: string): string | null {
  // Fase 2 sezione 3: sotto-etichetta di delega in coesistenza con quelle di stato già esistenti
  // (Segnalazioni/Chiusa, Segnalazioni/In corso) — un messaggio può avere entrambe. "Segnalazioni"
  // piatta resta solo il fallback quando la delega non è ancora nota (in pratica mai in scrittura,
  // dato che Pratica.delega è obbligatoria — ma la funzione può essere chiamata senza per un badge).
  // sottoTemaNome (2026-09-15, facoltativo): un livello in più quando Marco lo sceglie — es.
  // "Segnalazioni/Ciclo Rifiuti/Mancati Ritiri" — mai senza una delega valida sopra.
  if (categoria === "segnalazione") {
    if (!delega) return "Segnalazioni";
    const nomeEtichetta = nomeEtichettaDelega(delega);
    if (!nomeEtichetta) return "Segnalazioni";
    return sottoTemaNome ? `Segnalazioni/${nomeEtichetta}/${sottoTemaNome}` : `Segnalazioni/${nomeEtichetta}`;
  }
  if (categoria === "contestazione") return "Contestazioni";
  if (categoria === "giustifica") return "Giustifica"; // scelta manuale da Incerto — minuscolo, diverso da "GIUSTIFICA" (Automatico)
  if (categoria === "progetto") {
    if (delega) {
      const nomeEtichetta = nomeEtichettaDelega(delega);
      return nomeEtichetta ? `Deleghe/${nomeEtichetta}` : null;
    }
    // "Istituzioni" (chiamata "Varie" fino al 2026-09-15, rinominata su richiesta di Marco — più
    // corretto per un albero di enti/associazioni del territorio): un Progetto senza vera delega —
    // nome dell'ente esatto (es. "Comunicazioni", o qualunque ente aggiunto al volo).
    if (enteNome) return `Istituzioni/${enteNome}`;
    return null;
  }
  // ANCI/REGIONE/GOVERNO: categorie di primo livello instradate per dominio mittente (evolutiva
  // 2026-07-25), stesso ruolo delle altre categorie Automatico (CONVOCAZIONE_CONSIGLIO, ecc.) —
  // non hanno una vera etichetta Gmail preesistente in TASSONOMIA_MAIL, mappate qui direttamente.
  if (categoria === "ANCI" || categoria === "REGIONE" || categoria === "GOVERNO") {
    return `Istituzioni/${NOME_ENTE_FISSO[categoria]}`;
  }
  // DUP/Bilancio (evolutiva 2026-07-26, Bilancio Fase 2 sezione 7): riconoscimento per parola
  // chiave nell'oggetto (classificaDup/classificaBilancio in lib/classificatore.ts), non
  // un'etichetta Gmail preesistente — stesso trattamento di ANCI/REGIONE/GOVERNO sopra.
  // Enti riconosciuti per indirizzo esatto (enteEntrataPerIndirizzo): la categoria porta il nome
  // esatto dell'EnteVario dopo il prefisso "ENTE:" — nessuna tabella parallela da tenere allineata.
  if (categoria.startsWith("ENTE:")) return `Istituzioni/${categoria.slice(5)}`;
  // Mail fuori dalle deleghe di Marco (2026-09-23): sola etichetta, nome esatto di AltraDelega.
  if (categoria.startsWith("ALTRA_DELEGA:")) return `${PREFISSO_ALTRE_DELEGHE}/${categoria.slice(13)}`;
  if (categoria === "DUP") return "Giunta/Dup";
  if (categoria === "BILANCIO") return "Giunta/Bilancio";
  // Gestori in entrata (Fase 2 sezione 6.2): istradati per indirizzo mittente esatto (vedi
  // categoriaGestoreEntrataPerIndirizzo in lib/classificatore.ts), stesso ruolo di ANCI/REGIONE/
  // GOVERNO sopra — categorie di primo livello senza una vera etichetta Gmail preesistente.
  if (categoria in NOME_GESTORE_ENTRATA) return `Gestori/${NOME_GESTORE_ENTRATA[categoria]}`;
  for (const [etichetta, voce] of Object.entries(TASSONOMIA_MAIL)) {
    if ("fuoriScope" in voce) continue;
    if (categoriaProposta(voce) === categoria) return etichetta;
  }
  return null;
}

// Albero Gmail delle mail fuori dalle deleghe di Marco — unica costante da cambiare per rinominarlo.
export const PREFISSO_ALTRE_DELEGHE = "Altre deleghe";

export const ETICHETTA_INCERTO = "Incerto/Da classificare";
export const ETICHETTA_NON_RILEVANTE = "Bassa priorità/Non rilevante";

// Etichette Gmail di CLASSIFICAZIONE sotto "Segnalazioni" (Fase 2 sezione 3) — la piatta più una
// per delega, stessi nomi di "Deleghe/<nome>" (ETICHETTA_DELEGA). Esclude di proposito le
// etichette di STATO (Segnalazioni/Chiusa, Segnalazioni/In corso, mai scritte da questa funzione,
// gestite altrove) — usata per sapere quali rimuovere quando la delega cambia o la pratica si
// chiude, senza toccare mai lo stato.
export const ETICHETTE_SEGNALAZIONE = ["Segnalazioni", ...Object.keys(ETICHETTA_DELEGA).map(nome => `Segnalazioni/${nome}`)];

// Badge esplicito quando la categoria risolta è "progetto" ma classificaDelega() non ha trovato
// nessuna parola chiave (quindi nessuna delega attendibile da proporre) — mai un default silenzioso
// che sembri una proposta sicura. Non è un nodo reale dell'albero (nessuna sotto-etichetta Gmail
// "da specificare" esiste davvero): solo testo del badge, il tree-picker resta il modo per
// scegliere una vera "Deleghe/X".
export const ETICHETTA_DELEGA_DA_SPECIFICARE = "Deleghe/da specificare";

export type NodoAlberoEtichette = { etichetta: string; categoria: string; delega?: Delega; enteNome?: string };

// Albero completo per il selettore di categoria/etichetta nella revisione mail (sezione 6,
// redesign 2026-07-24) — deriva da TASSONOMIA_MAIL (unica fonte di verità, nessuna lista
// parallela da tenere sincronizzata) + "Segnalazioni", assente da TASSONOMIA_MAIL di proposito
// (non più un segnale automatico affidabile, vedi fix 2026-07-22) ma comunque una scelta manuale
// valida, quindi presente qui. `categoria` è lo stesso valore usato ovunque nel motore (chiave di
// GESTORI_AUTOMATICO per gli Automatico, o le 4 categorie del binario Manuale).
export const ALBERO_ETICHETTE_MAIL: NodoAlberoEtichette[] = [
  ...Object.entries(TASSONOMIA_MAIL)
    .filter((v): v is [string, Exclude<VoceTassonomiaMail, { fuoriScope: true }>] => !("fuoriScope" in v[1]))
    .map(([etichetta, voce]) => ({
      etichetta,
      categoria: categoriaProposta(voce),
      delega: "delega" in voce ? voce.delega : undefined,
    })),
  { etichetta: "Segnalazioni", categoria: "segnalazione" },
  // "Istituzioni" (chiamata "Varie" fino al 2026-09-15, rinominata su richiesta di Marco):
  // ANCI/Regione/Governo sono categorie di primo livello (Automatico, instradate per dominio
  // mittente — vedi categoriaVariaPerDominio in lib/classificatore.ts), Comunicazioni è un
  // Progetto (Manuale, nessun segnale di dominio affidabile) con enteNome al posto della delega.
  { etichetta: "Istituzioni/ANCI", categoria: "ANCI" },
  { etichetta: "Istituzioni/Regione", categoria: "REGIONE" },
  { etichetta: "Istituzioni/Governo", categoria: "GOVERNO" },
  { etichetta: "Istituzioni/Comunicazioni", categoria: "progetto", enteNome: "Comunicazioni" },
  // Enti riconosciuti per indirizzo esatto (enteEntrataPerIndirizzo, 2026-09-21): stesso schema di
  // Comunicazioni — Progetto Manuale sotto l'ente. Servono qui perché il form pre-seleziona l'ente
  // solo se l'etichetta proposta è un nodo dell'albero.
  { etichetta: "Istituzioni/Questura della Spezia", categoria: "progetto", enteNome: "Questura della Spezia" },
  { etichetta: "Istituzioni/Carabinieri — Stazione di Lerici", categoria: "progetto", enteNome: "Carabinieri — Stazione di Lerici" },
  { etichetta: "Istituzioni/Carabinieri — Stazione di Sarzana", categoria: "progetto", enteNome: "Carabinieri — Stazione di Sarzana" },
  { etichetta: "Istituzioni/Carabinieri — Comando Provinciale La Spezia", categoria: "progetto", enteNome: "Carabinieri — Comando Provinciale La Spezia" },
  { etichetta: "Istituzioni/Carabinieri — Stazione La Spezia", categoria: "progetto", enteNome: "Carabinieri — Stazione La Spezia" },
  { etichetta: "Istituzioni/Vigili del Fuoco — Comando di La Spezia", categoria: "progetto", enteNome: "Vigili del Fuoco — Comando di La Spezia" },
  { etichetta: "Istituzioni/ISA 10", categoria: "progetto", enteNome: "ISA 10" },
  { etichetta: "Istituzioni/Parrocchia", categoria: "progetto", enteNome: "Parrocchia" },
  // DUP/Bilancio (evolutiva 2026-07-26, Bilancio Fase 2 sezione 7): riconoscimento per parola
  // chiave nell'oggetto (classificaDup/classificaBilancio), non un'etichetta Gmail — stesso
  // trattamento di Varie/ANCI ecc. sopra.
  { etichetta: "Giunta/Dup", categoria: "DUP" },
  { etichetta: "Giunta/Bilancio", categoria: "BILANCIO" },
  // Gestori in entrata (Fase 2 sezione 6.2): istradati per indirizzo mittente esatto, stesso
  // ruolo di Istituzioni/ANCI ecc. sopra — nessuna vera etichetta Gmail preesistente in
  // TASSONOMIA_MAIL, mappate qui direttamente.
  { etichetta: "Gestori/Acam Ambiente", categoria: "GESTORE_ACAM_AMBIENTE" },
  { etichetta: "Gestori/Acam Acque", categoria: "GESTORE_ACAM_ACQUE" },
  { etichetta: "Gestori/ATC esercizio", categoria: "GESTORE_ATC_ESERCIZIO" },
  { etichetta: "Gestori/Enel", categoria: "GESTORE_ENEL" },
  { etichetta: "Gestori/Maris", categoria: "GESTORE_MARIS" },
  { etichetta: "Gestori/Ato Rifiuti", categoria: "GESTORE_ATO_RIFIUTI" },
];
