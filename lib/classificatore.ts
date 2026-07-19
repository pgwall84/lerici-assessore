const KEYWORDS: { delega: string; parole: string[] }[] = [
  {
    delega: "AMBIENTE",
    parole: [
      "sfalcio", "taglio verde", "erba alta", "disservizio rifiuti", "mancato ritiro",
      "pulizia", "bidoni", "rifiuti", "spazzatura", "abbandono rifiuti", "discarica",
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
      "raccolta differenziata", "bidone", "compostiera", "ingombranti",
      "etichette", "punto raccolta", "isola ecologica",
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

export function classificaDelega(testo: string): string {
  const lower = testo.toLowerCase();
  let best = { delega: "VIABILITA", score: 0 };

  for (const { delega, parole } of KEYWORDS) {
    const score = parole.filter(p => lower.includes(p.toLowerCase())).length;
    if (score > best.score) best = { delega, score };
  }

  return best.delega;
}

const GESTORE_KEYWORDS: [RegExp, "ACAM_ACQUE" | "ACAM_AMBIENTE" | "ATC"][] = [
  [/acam.{0,3}acque/i, "ACAM_ACQUE"],
  [/acam.{0,3}ambiente/i, "ACAM_AMBIENTE"],
  [/\batc\b/i, "ATC"],
];

export function classificaGestore(testo: string): "ACAM_ACQUE" | "ACAM_AMBIENTE" | "ATC" {
  for (const [re, gestore] of GESTORE_KEYWORDS) if (re.test(testo)) return gestore;
  return "ACAM_AMBIENTE";
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
