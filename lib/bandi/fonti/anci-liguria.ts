import * as cheerio from "cheerio";
import type { BandoRaw } from "./types";

const FONTE_URL = "https://www.anciliguria.it/bandi";
const ENTE = "ANCI Liguria";

function parseData(testo: string): Date | undefined {
  const m = testo.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return undefined;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

export async function parseAnciLiguria(): Promise<BandoRaw[]> {
  const res = await fetch(FONTE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`ANCI Liguria: HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const risultati: BandoRaw[] = [];

  $(".european-box").each((_, el) => {
    const bandoUrl = $(el).find("a[href*='/bandi/']").attr("href") ?? "";
    if (!bandoUrl) return;

    // Testo completo del box (senza il link "VEDI DETTAGLIO")
    const testoBruto = $(el).clone()
      .find(".european-in-box-link").remove().end()
      .text().replace(/\s+/g, " ").trim();

    // Rimuovi il prefisso stato+data: "APERTO SCADE IL: 31/08/2026, ORE 12:00 " o "CHIUSO IL: ..."
    const prefixRe = /^(APERTO|CHIUSO|IN APERTURA)[\s\S]*?ORE \d{2}:\d{2}\s*/i;
    const testoPulito = testoBruto.replace(prefixRe, "").trim();

    // La prima riga significativa è il titolo
    const righe = testoPulito.split(/\n|(?<=\w{3,}\.)\s+(?=[A-ZÀ-Ù])/);
    const titolo = righe[0]?.trim() ?? "";
    if (!titolo || titolo.length < 5) return;

    // Descrizione: il testo rimanente
    const descrizione = righe.slice(1).join(" ").trim().slice(0, 500) || undefined;

    // Data chiusura dal testo bruto
    const scadenzaMatch = testoBruto.match(/SCADE IL:\s*(\d{2}\/\d{2}\/\d{4})/i);
    const dataChiusura = scadenzaMatch ? parseData(scadenzaMatch[1]) : undefined;

    // Salta i bandi già chiusi
    if (dataChiusura && dataChiusura < new Date()) return;

    risultati.push({
      titolo: titolo.slice(0, 250),
      ente: ENTE,
      fonteUrl: FONTE_URL,
      bandoUrl,
      descrizione,
      dataChiusura,
    });
  });

  return risultati;
}
