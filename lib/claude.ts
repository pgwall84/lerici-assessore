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
