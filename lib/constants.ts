import { Delega, StatoPratica, TipoPratica } from "@prisma/client";

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
  MIA_IDEA: ["APPUNTO", "IN_VALUTAZIONE", "PROMOSSA", "ARCHIVIATA"],
  PROGETTO: ["IN_VALUTAZIONE", "IN_CORSO", "CHIUSA", "SOSPESA"],
};

// Stato iniziale per tipo
export const STATO_INIZIALE: Record<TipoPratica, StatoPratica> = {
  SEGNALAZIONE: "APERTA",
  MIA_IDEA: "APPUNTO",
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
