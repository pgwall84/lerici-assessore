import type { Bando } from "@prisma/client";

function formatData(d: Date): string {
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

export async function inviaBandiTelegram(bandi: Bando[]): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  // Raggruppa in un unico messaggio se > 5 bandi, altrimenti uno per uno
  if (bandi.length > 5) {
    const righe = [`📢 *${bandi.length} nuovi bandi rilevati*\n`];
    for (const b of bandi) {
      righe.push(
        `• *${b.titolo}* — ${b.ente}` +
        (b.dataChiusura ? ` ⏰ ${formatData(b.dataChiusura)}` : "") +
        `\n  ${b.bandoUrl ?? b.fonteUrl}`
      );
    }
    await sendTelegram(token, chatId, righe.join("\n"));
  } else {
    for (const b of bandi) {
      const righe = [
        `📋 *${b.titolo}*`,
        `🏛 ${b.ente}`,
      ];
      if (b.dataChiusura) righe.push(`⏰ Scadenza: ${formatData(b.dataChiusura)}`);
      if (b.dotazione) righe.push(`💰 ${b.dotazione}`);
      if (b.beneficiari) righe.push(`👥 ${b.beneficiari}`);
      righe.push(b.bandoUrl ?? b.fonteUrl);
      await sendTelegram(token, chatId, righe.join("\n"));
    }
  }
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    }),
  });
}

export async function inviaSegnalazioneRottura(fonte: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await sendTelegram(token, chatId, `⚠️ *Bandi — nessun risultato da ${fonte}*\nPossibile cambio layout del sito sorgente. Verificare manualmente.`);
}

// Alert dedicato per i fallimenti di estrazione AI (lib/bandi/estrazione-ai.ts): distinto dalla
// segnalazione di rottura sopra (quella è "una fonte non trova più nulla", questa è "alcuni
// candidati falliscono l'estrazione pur essendo stati trovati") — un aumento anomalo va reso
// visibile invece di tradursi silenziosamente in meno bandi salvati.
export async function inviaSegnalazioneEstrazione(righe: string[]): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await sendTelegram(token, chatId, `⚠️ *Bandi — errori di estrazione*\n${righe.join("\n")}`);
}
