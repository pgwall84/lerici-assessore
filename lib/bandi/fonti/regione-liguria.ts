import * as cheerio from "cheerio";
import type { BandoRaw } from "./types";

const FONTE_URL = "https://www.regione.liguria.it/homepage-bandi-e-avvisi/publiccompetitions.html";
const ENTE = "Regione Liguria";

function parseData(testo: string): Date | undefined {
  // formato: "08 Luglio 2026"
  const mesi: Record<string, number> = {
    gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5,
    luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11,
  };
  const m = testo.trim().match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return undefined;
  const mese = mesi[m[2].toLowerCase()];
  if (mese === undefined) return undefined;
  return new Date(Number(m[3]), mese, Number(m[1]));
}

export async function parseRegioneLiguria(): Promise<BandoRaw[]> {
  const res = await fetch(FONTE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Regione Liguria: HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const risultati: BandoRaw[] = [];

  $(".pc_latest_item_bando").each((_, el) => {
    const link = $(el).find("a.bando_link").first();
    const titolo = link.text().trim();
    if (!titolo || titolo.length < 5) return;

    const href = link.attr("href") ?? "";
    const bandoUrl = href.startsWith("http") ? href : `https://www.regione.liguria.it${href}`;

    // Dotazione: secondo .pc_latest_item_bando_titolo (quello senza <a>)
    const dotazioneTesto = $(el).find(".pc_latest_item_bando_titolo").filter((_, e) => !$(e).find("a").length).first().text().trim();
    const dotazione = dotazioneTesto || undefined;

    // Date dal title attribute
    const chiusuraTxt = $(el).find(".pc_latest_item_chiusura").attr("title") ?? "";
    const aperturaTxt = $(el).find(".pc_latest_item_apertura_bando").attr("title") ?? "";
    const dataChiusura = parseData(chiusuraTxt.replace(/Data chiusura:\s*/i, ""));
    const dataApertura = parseData(aperturaTxt.replace(/Data apertura:\s*/i, ""));

    // Categoria (CONTRIBUTI, AVVISI, ecc.)
    const categoria = $(el).find(".pc_latest_item_fondo_link").text().trim();
    const descrizione = categoria || undefined;

    risultati.push({ titolo, ente: ENTE, fonteUrl: FONTE_URL, bandoUrl, descrizione, dotazione, dataApertura, dataChiusura });
  });

  return risultati;
}
