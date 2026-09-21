const KEYWORDS: { delega: string; parole: string[] }[] = [
  {
    delega: "AMBIENTE",
    // "rifiuti"/"mancato ritiro"/"disservizio rifiuti"/"abbandono rifiuti"/"spazzatura"/"bidoni"
    // spostate su RIFIUTI (Ciclo Rifiuti) il 2026-09-15, su decisione esplicita di Marco: un report
    // generico di mancata raccolta deve proporre Ciclo Rifiuti, non Ambiente (caso reale: mail
    // "Disservizi Via G.B. Zanelli" — "mancate raccolte dei rifiuti" proponeva Ambiente perché
    // "rifiuti" viveva solo qui, mentre RIFIUTI aveva solo termini stretti tipo "isola ecologica").
    // Resta Ambiente: degrado/igiene ambientale generico non legato al servizio di raccolta.
    parole: [
      "sfalcio", "taglio verde", "erba alta",
      "pulizia", "discarica",
      "topi", "derattizzazione", "cinghiali", "odori", "puzza", "cestino pieno",
      "spazzamento", "verde pubblico",
    ],
  },
  {
    delega: "SISTEMA_IDRICO",
    parole: [
      "scarico in mare", "inquinamento marino", "mare", "acqua", "perdita idrica",
      "perdita d'acqua", "allagamento", "canale", "fosso", "tombino", "fogna",
      "fognatura", "pressione acqua", "acquedotto",
    ],
  },
  {
    delega: "VIABILITA",
    parole: [
      "griglia", "panettone", "transenna", "strada", "buca", "avvallamento",
      "marciapiede", "segnaletica", "guard rail", "parcheggio", "dosso",
      "attraversamento pedonale", "specchio stradale", "albero", "detrito",
      "carreggiata", "asfalto", "manto stradale",
    ],
  },
  {
    delega: "ILLUMINAZIONE",
    parole: [
      "lampione", "luce", "illuminazione", "buio", "palo", "cavo elettrico",
      "lampada", "zona buia",
    ],
  },
  {
    delega: "MANUTENZIONE_PATRIMONIO",
    parole: [
      "edificio pubblico", "infiltrazioni", "umidità", "infissi", "porte rotte",
      "parco", "area verde", "recinzione", "impianto sportivo", "spogliatoio",
      "paletto", "manutenzione", "palazzo comunale", "scuola", "struttura",
    ],
  },
  {
    delega: "ACCESSIBILITA",
    parole: [
      "barriera architettonica", "disabile", "scivolo", "rampa", "ascensore",
      "montascale", "carrozzina", "accessibilità",
    ],
  },
  {
    delega: "RIFIUTI",
    parole: [
      "raccolta differenziata", "bidone", "bidoni", "compostiera", "ingombranti",
      "etichette", "punto raccolta", "isola ecologica",
      "rifiuti", "mancato ritiro", "disservizio rifiuti", "abbandono rifiuti", "spazzatura",
    ],
  },
  {
    delega: "CIMITERI",
    parole: [
      "cimitero", "loculo", "sepoltura", "tomba", "vialetto cimitero",
      "concessione cimiteriale",
    ],
  },
  {
    delega: "POLITICHE_ABITATIVE",
    parole: [
      "alloggio", "casa popolare", "erp", "affitto", "morosità", "occupazione abusiva",
      "edilizia residenziale",
    ],
  },
  {
    delega: "DIGITALIZZAZIONE",
    parole: [
      "portale", "sito comune", "wifi", "connettività", "servizio online", "app comunale",
    ],
  },
];

// null quando nessuna parola chiave combacia — mai un default silenzioso (prima era VIABILITA
// a prescindere, indistinguibile da un vero match): un'incertezza visibile è meglio di una falsa
// certezza, stesso principio già applicato altrove in questa sessione. Il chiamante decide come
// mostrarla (badge "da specificare", placeholder nel selettore, ecc.), non la nasconde.
export function classificaDelega(testo: string): string | null {
  const lower = testo.toLowerCase();
  let best = { delega: "", score: 0 };

  for (const { delega, parole } of KEYWORDS) {
    const score = parole.filter(p => lower.includes(p.toLowerCase())).length;
    if (score > best.score) best = { delega, score };
  }

  return best.score > 0 ? best.delega : null;
}

// SottoTema (Fase 2, 2026-09-15): stessa euristica di classificaDelega, un livello più giù —
// solo per delega/sotto-tema già seedati in DB (vedi migrazione 20260915130000_add_sotto_tema),
// mai un nome inventato al volo: un sotto-tema nuovo creato da Marco nel form non ha keyword
// finché non vengono aggiunte qui a mano, stesso limite già accettato per classificaGestore.
// Filtrata per delega (non un punteggio globale come sopra): un sotto-tema ha senso solo dentro
// la delega a cui appartiene, non in competizione con quelli di un'altra.
const SOTTOTEMA_KEYWORDS: { delega: string; nome: string; parole: string[] }[] = [
  {
    delega: "RIFIUTI",
    nome: "Mancati Ritiri",
    parole: ["mancato ritiro", "mancata raccolta", "mancate raccolte", "non ritirano", "non è stato ritirato", "saltato il ritiro"],
  },
  {
    delega: "RIFIUTI",
    nome: "Ingombranti",
    parole: ["ingombranti"],
  },
  {
    delega: "RIFIUTI",
    nome: "Degrado",
    parole: ["abbandono rifiuti", "rifiuti abbandonati", "discarica abusiva", "cumulo di rifiuti"],
  },
  {
    delega: "AMBIENTE",
    nome: "Sfalci",
    parole: ["sfalcio", "sfalci", "erba alta", "taglio erba", "taglio verde"],
  },
];

// null quando nessuna parola chiave combacia o la delega non ha sotto-temi noti — sempre solo un
// suggerimento pre-selezionato, mai vincolante (vedi risolviSottoTemaId: il client può sempre
// cambiarlo o lasciarlo vuoto prima di confermare).
export function classificaSottoTema(delega: string | null | undefined, testo: string): string | null {
  if (!delega) return null;
  const lower = testo.toLowerCase();
  let best = { nome: "", score: 0 };

  for (const { delega: d, nome, parole } of SOTTOTEMA_KEYWORDS) {
    if (d !== delega) continue;
    const score = parole.filter(p => lower.includes(p.toLowerCase())).length;
    if (score > best.score) best = { nome, score };
  }

  return best.score > 0 ? best.nome : null;
}

// Ritorna il "nome" del Gestore (stesso valore seedato in DB, sezione 6.1) — non un id: questa
// funzione resta sincrona e senza accesso al DB, la risoluzione nome->id avviene lato chiamante
// (che ha già la lista Gestori caricata per popolare il selettore).
const GESTORE_KEYWORDS: [RegExp, string][] = [
  [/acam.{0,3}acque/i, "ACAM Acque"],
  [/acam.{0,3}ambiente/i, "ACAM Ambiente"],
  [/\batc\b/i, "ATC Esercizio"],
  [/\benel\b/i, "Enel"],
  [/\bmaris\b/i, "Maris"],
];

// null quando nessuna parola chiave combacia — mai un default silenzioso (fino a Fase 2 sezione
// 6.1 ritornava sempre "ACAM Ambiente" anche senza match: unico punto della codebase che violava
// questo principio, scoperto leggendo il codice per questa stessa modifica). Un'incertezza
// visibile è meglio di una falsa certezza, stesso principio di classificaDelega sopra.
export function classificaGestore(testo: string): string | null {
  for (const [re, nome] of GESTORE_KEYWORDS) if (re.test(testo)) return nome;
  return null;
}

// Instradamento per dominio mittente (evolutiva "Varie" 2026-07-25): regola scritta nel codice,
// non un'etichetta Gmail preesistente — verificabile e correggibile qui, non nascosta in un
// filtro Gmail. REGIONE controllata prima di GOVERNO di proposito: un dominio già catturato da
// REGIONE non deve mai finire genericamente in GOVERNO. "COMUNICAZIONI" non ha un dominio
// affidabile — resta fuori da questa funzione, sempre a classificazione manuale.
export function categoriaVariaPerDominio(emailMittente: string): "ANCI" | "REGIONE" | "GOVERNO" | null {
  const email = emailMittente.toLowerCase().trim();
  // Oltre al dominio nudo anci.it, le caselle reali (PEC nazionale, ANCI Liguria) usano altri
  // domini — elenco esplicito degli indirizzi raccolti il 2026-09-15 (spec Fase 2 sezione 5).
  if (email.endsWith("@anci.it") || email.endsWith("@pec.anci.it") || email.endsWith("@anciliguria.eu") || email === "anciliguria@pec.it") return "ANCI";
  if (email.includes("regione.liguria.it")) return "REGIONE";
  // Le caselle reali di Prefettura/Ministeri non finiscono in .gov.it (è il TLD del sito, non
  // della PEC): elenco esplicito, stesso principio.
  if (email.endsWith(".gov.it") || email.endsWith("@pec.interno.it") || email === "prefettura.laspezia@interno.it" || email === "pnrr@postacert.istruzione.it") return "GOVERNO";
  return null;
}

// Enti istituzionali/forze dell'ordine/scuole riconosciuti per INDIRIZZO ESATTO (2026-09-21):
// come per i Gestori, i domini PEC sono condivisi (pec.carabinieri.it per tutte le stazioni,
// cert.vigilfuoco.it per tutte le caselle dei Vigili del Fuoco), quindi mai per dominio nudo.
// `nome` deve combaciare esattamente con EnteVario.nome in DB. Indirizzi raccolti il 2026-09-15
// (vedi spec Fase 2 sezione 5). Stesso trattamento Automatico di ANCI/Regione/Governo: Progetto
// (Attività) sotto quell'ente, etichetta Istituzioni/<nome>.
const ENTI_ENTRATA: { nome: string; indirizzi: string[] }[] = [
  { nome: "Questura della Spezia", indirizzi: ["gab.quest.sp@pecps.poliziadistato.it", "dipps177.00f0@pecps.poliziadistato.it"] },
  { nome: "Carabinieri — Stazione di Lerici", indirizzi: ["tsp25829@pec.carabinieri.it"] },
  { nome: "Carabinieri — Stazione di Sarzana", indirizzi: ["tsp25711@pec.carabinieri.it"] },
  { nome: "Carabinieri — Comando Provinciale La Spezia", indirizzi: ["tsp22304@pec.carabinieri.it"] },
  { nome: "Carabinieri — Stazione La Spezia", indirizzi: ["tsp24770@pec.carabinieri.it"] },
  {
    nome: "Vigili del Fuoco — Comando di La Spezia",
    indirizzi: ["com.laspezia@cert.vigilfuoco.it", "com.salaop.laspezia@cert.vigilfuoco.it", "com.prev.laspezia@cert.vigilfuoco.it"],
  },
  { nome: "ISA 10", indirizzi: ["spic806007@pec.istruzione.it"] },
];

export function enteEntrataPerIndirizzo(emailMittente: string): string | null {
  const email = emailMittente.toLowerCase().trim();
  return ENTI_ENTRATA.find(e => e.indirizzi.includes(email))?.nome ?? null;
}

// Istradamento in entrata per i Gestori (Fase 2 sezione 6.2, 2026-09-15): mail che arriva DA un
// gestore esterno, non ancora agganciata a una Contestazione esistente (quel caso è già
// intercettato prima di questa funzione da trovaContinuazioneForte, via protocollo/threadId — se
// risponde a una contestazione tracciata resta in quel flusso, invariato). Match per INDIRIZZO
// ESATTO, mai per dominio nudo: verificato raccogliendo gli indirizzi reali (2026-09-15) che
// molti di questi domini sono condivisi tra più enti (pec.gruppoiren.it usato sia da ACAM
// Ambiente che da ACAM Acque, legalmail.it condiviso da ATC Esercizio e Ato Rifiuti) o sono
// provider PEC generici non esclusivi (pec.it usato da Maris). `categoria` è la stessa stringa
// usata come chiave in GESTORI_AUTOMATICO (motore-mail.ts e conferma/route.ts) e in
// NOME_GESTORE_ENTRATA (constants.ts, per l'etichetta "Gestori/<nome>") — un'unica fonte per gli
// indirizzi, le altre due tabelle derivano da questa stessa categoria.
const GESTORI_ENTRATA: { categoria: string; indirizzi: string[] }[] = [
  {
    categoria: "GESTORE_ACAM_AMBIENTE",
    indirizzi: [
      "acamambiente@pec.gruppoiren.it", "ccambiente@pec.gruppoiren.it",
      "marco.salatino@gruppoiren.it", "diego.quarantiello@gruppoiren.it", "simone.merlo@gruppoiren.it",
    ],
  },
  { categoria: "GESTORE_ACAM_ACQUE", indirizzi: ["acamacque@pec.gruppoiren.it"] },
  { categoria: "GESTORE_ATC_ESERCIZIO", indirizzi: ["atceserciziospa@legalmail.it"] },
  { categoria: "GESTORE_ENEL", indirizzi: ["e-distribuzione@pec.e-distribuzione.it"] },
  { categoria: "GESTORE_MARIS", indirizzi: ["coopmaris@pec.it"] },
  { categoria: "GESTORE_ATO_RIFIUTI", indirizzi: ["ato.rifiuti.provincia.laspezia@legalmail.it", "atorifiuti@provincia.sp.it"] },
];

export function categoriaGestoreEntrataPerIndirizzo(emailMittente: string): string | null {
  const email = emailMittente.toLowerCase().trim();
  return GESTORI_ENTRATA.find(g => g.indirizzi.includes(email))?.categoria ?? null;
}

// Riconoscimento Giunta/Dup (evolutiva 2026-07-26): parola chiave nell'oggetto, non un'etichetta
// Gmail preesistente. Verificato dal vivo sul corpus reale (2026-07-26): un solo caso trovato,
// oggetto esattamente "DUP" — segnale pulito ma campione troppo piccolo per fidarsi ciecamente,
// quindi binario MANUALE (non Automatico) in classificaESalva nonostante il match sia certo qui.
// "\bDUP\b" richiede una parola isolata (maiuscole comprese, i.e. non "duplicato").
const REGEX_DUP = /\bDUP\b|documento\s+unico\s+di\s+programmazione/i;

export function classificaDup(oggetto: string): boolean {
  return REGEX_DUP.test(oggetto);
}

// Riconoscimento Giunta/Bilancio (Fase 2 sezione 7, 2026-09-15): stesso trattamento di DUP sopra
// — parola chiave nell'oggetto, non un'etichetta Gmail preesistente, binario MANUALE (volumi
// bassi confermati da Marco: "ce ne saranno poche", segnale testuale pulito ma campione troppo
// piccolo per fidarsi ciecamente).
const REGEX_BILANCIO = /\bbilancio\s+di\s+previsione\b|\bbilancio\s+di\s+esercizio\b|\brendiconto\s+di\s+gestione\b|\bvariazione\s+di\s+bilancio\b/i;

export function classificaBilancio(oggetto: string): boolean {
  return REGEX_BILANCIO.test(oggetto);
}

export function estraiTitolo(oggetto: string, corpo: string): string {
  if (oggetto && oggetto.trim().length > 5) {
    return oggetto.replace(/^(re:|fwd?:|i:|fw:)\s*/gi, "").trim().slice(0, 120);
  }
  const primaRiga = corpo.split("\n").find(r => r.trim().length > 10);
  return (primaRiga ?? "Segnalazione da mail").trim().slice(0, 120);
}

export function estraiLuogo(testo: string): string {
  const lower = testo.toLowerCase();
  const patterns = [
    /(?:via|viale|piazza|largo|lungomare|loc(?:alità)?\.?|frazione)\s+[a-zàèéìòùA-Z\s']+/gi,
    /(?:in|a|presso|davanti a?|vicino a?)\s+(?:via|viale|piazza)\s+[a-zàèéìòùA-Z\s']+/gi,
  ];
  for (const re of patterns) {
    const m = testo.match(re);
    if (m?.[0]) return m[0].trim().slice(0, 100);
  }
  return "";
}
