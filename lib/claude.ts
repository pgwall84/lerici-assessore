import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY non configurata");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const PROMPT = (testo: string) => `Sei un assistente che trasforma una nota vocale trascritta in una checklist di argomenti puntuali per una riunione.
Dividi il testo seguente in argomenti separati, uno per punto. Ogni punto deve essere una frase breve e concreta.
Mantieni intatti numeri, nomi, importi e riferimenti specifici — non riassumere, non generalizzare.
Rispondi SOLO con un array JSON di stringhe, nessun altro testo.

Testo: "${testo}"`;

export async function generaChecklist(trascrizioneGrezza: string): Promise<string[]> {
  const testo = trascrizioneGrezza.trim();
  if (!testo) return [];

  const msg = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: PROMPT(testo) }],
  });

  const blocco = msg.content.find(b => b.type === "text");
  if (!blocco || blocco.type !== "text") return [];

  const match = blocco.text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  } catch {
    return [];
  }
}

const PROMPT_ODG = (testo: string) => `Sei un assistente che riformatta il testo grezzo di un ordine del giorno (estratto da un PDF o DOCX di convocazione) in un elenco puntato pulito.
Dividi il testo in punti separati, uno per argomento all'ordine del giorno. Non riassumere, non generalizzare: mantieni intatti numeri di delibera, riferimenti normativi, nomi e importi esattamente come scritti.
Ignora intestazioni, piè di pagina, numeri di pagina e altri elementi che non sono punti dell'ordine del giorno.
Rispondi SOLO con un array JSON di stringhe, nessun altro testo.

Testo: "${testo}"`;

export async function riformattaOdg(testoGrezzo: string): Promise<string[]> {
  const testo = testoGrezzo.trim().slice(0, 20000);
  if (!testo) return [];

  const msg = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: PROMPT_ODG(testo) }],
  });

  const blocco = msg.content.find(b => b.type === "text");
  if (!blocco || blocco.type !== "text") return [];

  const match = blocco.text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  } catch {
    return [];
  }
}

// Le prime tre sono le categorie del binario Manuale: Consiglio/Giunta/Giustifica (binario
// Automatico) sono sempre identificate con certezza dalla loro etichetta Gmail dedicata, mai da
// un'ipotesi su testo libero — se una di queste arriva priva della sua etichetta nota, è un caso
// genuinamente anomalo che va in Incerto, non un'ipotesi che l'AI deve provare a indovinare.
// "non_rilevante" è la quarta: mail fuori scope per il tool (newsletter, bollettini, inviti a
// eventi) — va smaltita subito (binario NON_RILEVANTE), non lasciata in Incerto all'infinito.
const CATEGORIE_MAIL = ["segnalazione", "progetto", "contestazione", "non_rilevante"] as const;

const PROMPT_CLASSIFICA = (mittente: string, oggetto: string, estratto: string) => `Sei un assistente che classifica una PEC in arrivo al Comune di Lerici per un tool di gestione pratiche dell'Assessore.
Categorie possibili, una sola:
- "segnalazione": un cittadino segnala un problema/disservizio al Comune
- "progetto": riguarda un progetto/iniziativa amministrativa in corso, legato a una delega specifica
- "contestazione": il Comune contesta un mancato servizio a un gestore esterno (ACAM Ambiente, ACAM Acque, ATC)
- "non_rilevante": non è materia di nessuna delle categorie sopra — newsletter, bollettini informativi, inviti a eventi/convegni, comunicazioni generiche che non richiedono la creazione di una pratica

Se il testo non permette di scegliere con sufficiente sicurezza una di queste categorie, rispondi con categoria null.
Rispondi SOLO con un oggetto JSON, nessun altro testo, nel formato esatto:
{"categoria": "segnalazione" | "progetto" | "contestazione" | "non_rilevante" | null, "confidenza": 0.0-1.0}

Mittente: "${mittente}"
Oggetto: "${oggetto}"
Estratto: "${estratto}"`;

export type ClassificazioneMail = { categoria: typeof CATEGORIE_MAIL[number]; confidenza: number };

// Usata dal motore di scansione mail (sezione 6) solo per i casi che le regole (etichette Gmail
// note) non risolvono. Nessun output = tier Incerto, mai una forzatura verso una categoria a caso.
export async function classificaMail(mittente: string, oggetto: string, estratto: string): Promise<ClassificazioneMail | null> {
  const testo = estratto.trim().slice(0, 3000);

  const msg = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{ role: "user", content: PROMPT_CLASSIFICA(mittente.trim(), oggetto.trim(), testo) }],
  });

  const blocco = msg.content.find(b => b.type === "text");
  if (!blocco || blocco.type !== "text") return null;

  const match = blocco.text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed || typeof parsed !== "object") return null;
    const categoria = parsed.categoria;
    const confidenza = Number(parsed.confidenza);
    if (!CATEGORIE_MAIL.includes(categoria) || !Number.isFinite(confidenza)) return null;
    return { categoria, confidenza };
  } catch {
    return null;
  }
}
