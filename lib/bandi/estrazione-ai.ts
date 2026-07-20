import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY non configurata");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const AMBITI = ["liguria", "nazionale", "altra_regione", "non_specificato"] as const;
const TIPI_BENEFICIARIO = ["ENTE_PUBBLICO", "IMPRESA", "MISTO", "CITTADINO"] as const;

export type AmbitoTerritoriale = typeof AMBITI[number];
export type TipoBeneficiarioAI = typeof TIPI_BENEFICIARIO[number];

export type CampiBandoEstratti = {
  titolo: string;
  descrizione?: string;
  dotazione?: string;
  beneficiari?: string;
  dataChiusura?: string; // ISO date (solo la parte data)
  ambitoTerritoriale: AmbitoTerritoriale;
  sogliaPopolazione?: number;
  tipoBeneficiario?: TipoBeneficiarioAI;
};

const PROMPT = (ente: string, testo: string) => `Sei un assistente che estrae i dati strutturati di un bando/finanziamento pubblico per enti locali dal testo di una pagina web, per un tool di monitoraggio bandi usato dall'Assessore del Comune di Lerici (Liguria).

Estrai questi campi dal testo:
- "titolo": il titolo del bando (stringa, obbligatorio — se non è identificabile con certezza, usa la prima frase significativa del testo)
- "descrizione": breve riassunto di 1-2 frasi di cosa finanzia il bando (opzionale)
- "dotazione": l'importo/stanziamento del bando così come scritto nel testo, es. "1,5 milioni di euro" (opzionale)
- "beneficiari": chi può partecipare, così come descritto nel testo (opzionale)
- "dataChiusura": la data di scadenza per la presentazione delle domande, in formato ISO YYYY-MM-DD (opzionale, solo se esplicita nel testo)
- "ambitoTerritoriale": l'ambito geografico del bando, uno tra:
  - "nazionale": rivolto a tutti i comuni/enti italiani, o esplicitamente PNRR/ministeriale senza restrizione regionale
  - "liguria": rivolto esplicitamente alla Liguria o a comuni liguri
  - "altra_regione": rivolto esplicitamente a un'altra regione italiana (non Liguria) e non alla Liguria
  - "non_specificato": il testo non permette di determinare l'ambito con sicurezza
- "sogliaPopolazione": se il bando specifica un tetto massimo di abitanti per l'ammissibilità del comune (es. "Comuni fino a 15.000 abitanti" → 15000), il numero; altrimenti ometti il campo
- "tipoBeneficiario": chi può essere beneficiario, uno tra "ENTE_PUBBLICO" (comuni/enti locali/pubblica amministrazione), "IMPRESA" (solo aziende/partite IVA), "MISTO" (sia enti pubblici che imprese/altri soggetti), "CITTADINO" (privati cittadini); se non determinabile ometti il campo

Se il testo non descrive affatto un bando/finanziamento (es. è una notizia generica, un evento, una pagina di errore), rispondi con {"titolo": null}.
Rispondi SOLO con un oggetto JSON, nessun altro testo.

Fonte: ${ente}
Testo della pagina:
"""
${testo}
"""`;

// L'AI a volte scrive in "dataChiusura" qualcosa che non è una vera data ISO (es. "non
// specificata", "da definire") nonostante il prompt chieda esplicitamente YYYY-MM-DD o di
// omettere il campo — un valore così, passato a `new Date()` e poi a Prisma, genera un
// "Invalid time value" e fa fallire l'intera riga in DB (osservato dal vivo). Meglio scartare
// solo la data e tenere il resto dei campi validi, che perdere l'intero bando per questo.
function dataIsoValida(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function isCampiValidi(v: unknown): v is CampiBandoEstratti {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.titolo !== "string" || o.titolo.trim().length < 5) return false;
  if (!AMBITI.includes(o.ambitoTerritoriale as AmbitoTerritoriale)) return false;
  if (o.sogliaPopolazione !== undefined && !Number.isFinite(Number(o.sogliaPopolazione))) return false;
  if (o.tipoBeneficiario !== undefined && !TIPI_BENEFICIARIO.includes(o.tipoBeneficiario as TipoBeneficiarioAI)) return false;
  return true;
}

// "non_bando" = l'AI ha determinato correttamente che il testo non descrive un bando (rifiuto
// legittimo, stesso principio di "non_rilevante" nel motore mail — non è un errore).
// "errore" = fallimento tecnico dell'estrazione (chiamata API fallita, risposta senza JSON
// valido, campo enum non valido) — questi vanno contati e resi visibili dal chiamante (per
// fonte/per run), non solo scartati in silenzio, altrimenti un aumento anomalo si traduce solo
// in "meno bandi trovati" senza che nessuno se ne accorga.
export type RisultatoEstrazione =
  | { esito: "ok"; campi: CampiBandoEstratti }
  | { esito: "non_bando" }
  | { esito: "errore"; motivo: string };

// Sostituisce l'estrazione a selettori CSS/regex nelle fonti di lib/bandi/fonti/*: un LLM che
// legge il testo capisce titolo e ambito territoriale dal contenuto, non da un tag/classe che
// può puntare al posto sbagliato senza errore visibile (i due bug UPEL/Conferenza Stato-Città
// risolti in questa sessione erano entrambi di questo tipo).
export async function estraiCampiBando(testo: string, contesto: { ente: string }): Promise<RisultatoEstrazione> {
  const testoPulito = testo.trim().slice(0, 6000);
  if (!testoPulito) return { esito: "errore", motivo: "testo vuoto" };

  let msg;
  try {
    msg = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: PROMPT(contesto.ente, testoPulito) }],
    });
  } catch (err) {
    return { esito: "errore", motivo: err instanceof Error ? err.message : String(err) };
  }

  const blocco = msg.content.find(b => b.type === "text");
  if (!blocco || blocco.type !== "text") return { esito: "errore", motivo: "risposta senza blocco di testo" };

  const match = blocco.text.match(/\{[\s\S]*\}/);
  if (!match) return { esito: "errore", motivo: "nessun JSON nella risposta" };

  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed || typeof parsed !== "object") return { esito: "errore", motivo: "JSON non è un oggetto" };
    if (parsed.titolo === null) return { esito: "non_bando" };
    if (!isCampiValidi(parsed)) return { esito: "errore", motivo: "campi estratti non validi" };
    return {
      esito: "ok",
      campi: {
        titolo: parsed.titolo.trim(),
        descrizione: typeof parsed.descrizione === "string" ? parsed.descrizione.trim() || undefined : undefined,
        dotazione: typeof parsed.dotazione === "string" ? parsed.dotazione.trim() || undefined : undefined,
        beneficiari: typeof parsed.beneficiari === "string" ? parsed.beneficiari.trim() || undefined : undefined,
        dataChiusura: typeof parsed.dataChiusura === "string" && dataIsoValida(parsed.dataChiusura.trim())
          ? parsed.dataChiusura.trim()
          : undefined,
        ambitoTerritoriale: parsed.ambitoTerritoriale,
        sogliaPopolazione: parsed.sogliaPopolazione !== undefined ? Number(parsed.sogliaPopolazione) : undefined,
        tipoBeneficiario: parsed.tipoBeneficiario,
      },
    };
  } catch (err) {
    return { esito: "errore", motivo: `JSON.parse fallito: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// Helper condiviso per le fonti che hanno già il testo di ogni candidato in mano (niente fetch
// per-candidato da fare, a differenza di UPEL che deve scaricare ogni pagina di dettaglio) — usato
// da x-desk e ANCI Liguria. Concorrenza limitata: in sequenza 27 candidati (visto su x-desk) hanno
// impiegato 47s, troppo vicino/oltre il tetto di durata del cron insieme alle altre fonti.
export async function estraiBatch<T extends { testo: string }>(
  candidati: T[],
  ente: string,
  concorrenza = 6
): Promise<{ risultati: Array<{ candidato: T; campi: CampiBandoEstratti }>; estratti: number; nonBando: number; falliti: number }> {
  const risultati: Array<{ candidato: T; campi: CampiBandoEstratti }> = [];
  let estratti = 0, nonBando = 0, falliti = 0;

  let indice = 0;
  async function worker() {
    while (indice < candidati.length) {
      const candidato = candidati[indice++];
      const esito = await estraiCampiBando(candidato.testo, { ente });
      if (esito.esito === "errore") { falliti++; continue; }
      if (esito.esito === "non_bando") { nonBando++; continue; }
      estratti++;
      risultati.push({ candidato, campi: esito.campi });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concorrenza, candidati.length) }, worker));

  return { risultati, estratti, nonBando, falliti };
}
