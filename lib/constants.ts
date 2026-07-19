import { Delega, Priorita, StatoAtto, StatoPratica, StatoProgetto, StatoRiunione, TipoAtto, TipoPratica } from "@prisma/client";

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

export const STATI_OPERATIVA: StatoPratica[] = ["APERTA", "IN_CORSO", "IN_VALUTAZIONE", "PROMOSSA"];
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
};

// Etichette brevi per la sidebar delle sotto-categorie (stile Deleghe di Progetti).
export const TIPO_ATTO_LABEL_BREVE: Record<TipoAtto, string> = {
  CONVOCAZIONE_CONSIGLIO: "Consiglio Comunale",
  CONVOCAZIONE_COMMISSIONE: "Commissioni",
  MOZIONE: "Mozioni",
  INTERROGAZIONE: "Interrogazioni",
  CONVOCAZIONE_GIUNTA: "Giunta",
};

export const TIPO_ATTO_ICONA: Record<TipoAtto, string> = {
  CONVOCAZIONE_GIUNTA: "🏛️",
  CONVOCAZIONE_CONSIGLIO: "🏛️",
  CONVOCAZIONE_COMMISSIONE: "🗂️",
  MOZIONE: "📄",
  INTERROGAZIONE: "❓",
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
  PRONTA: "Pronta",
  IN_CORSO: "In corso",
  CONCLUSA: "Conclusa",
};

export const STATO_RIUNIONE_COLORE: Record<StatoRiunione, string> = {
  IN_PREPARAZIONE: "bg-gray-100 text-gray-600",
  PRONTA: "bg-blue-100 text-blue-700",
  IN_CORSO: "bg-yellow-100 text-yellow-800",
  CONCLUSA: "bg-green-100 text-green-800",
};

export const STATI_RIUNIONE_OPERATIVA: StatoRiunione[] = ["IN_PREPARAZIONE", "PRONTA", "IN_CORSO"];
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
