import * as cheerio from "cheerio";
import type { BandoRaw } from "./types";

const BASE_URL = "https://www.conferenzastatocitta.gov.it";
const FONTE_URL = `${BASE_URL}/home/notizie-e-comunicati/2026/`;
const ENTE = "Conferenza Stato-Città";

// Keyword nel titolo che indicano un bando/finanziamento rilevante
const KEYWORD_BANDO = [
  "bando", "finanziament", "contribut", "fondi", "milioni", "pnrr",
  "avviso pubblico", "incentiv", "agevolazion", "risorse",
];

function isTitoloRilevante(titolo: string): boolean {
  const lower = titolo.toLowerCase();
  return KEYWORD_BANDO.some(k => lower.includes(k));
}

function parseData(testo: string): Date | undefined {
  const m = testo.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return undefined;
}

async function fetchDescrizione(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    const $ = cheerio.load(html);
    // Primo paragrafo significativo nell'articolo
    let descrizione = "";
    $("article p, .content p, main p").each((_, el) => {
      const t = $(el).text().trim();
      if (t.length > 60 && !descrizione) descrizione = t.slice(0, 500);
    });
    return descrizione || undefined;
  } catch {
    return undefined;
  }
}

export async function parseConferenzaStatoCitta(): Promise<BandoRaw[]> {
  // Scrapa le prime 2 pagine (notizie recenti)
  const pagine = [FONTE_URL, `${FONTE_URL}?p=2`];
  const articoli: Array<{ titolo: string; href: string; data?: Date }> = [];

  for (const paginaUrl of pagine) {
    const res = await fetch(paginaUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      if (paginaUrl.includes("p=2")) break; // seconda pagina opzionale
      throw new Error(`Conferenza Stato-Città: HTTP ${res.status}`);
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    // Il testo del link stesso non è più il titolo (il sito lo ha ridotto a un CTA generico
    // "SCOPRI TUTTO" identico su ogni card) — il titolo vero sta nell'<h3> dentro la stessa
    // .card-body, la data nel <label class="card-label-date"> accanto.
    $("a.read-more[href*='/notizie-e-comunicati/']").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const slug = href.replace(FONTE_URL, "").replace(/^\/home\/notizie-e-comunicati\/\d+\//, "");
      // Salta la pagina di listing stessa e i link di paginazione
      if (!slug || slug.startsWith("?") || href === FONTE_URL) return;

      const cardBody = $(el).closest(".card-body");
      const titolo = cardBody.find("h3").first().text().trim().replace(/\s+/g, " ");
      if (titolo.length < 10) return;
      if (!isTitoloRilevante(titolo)) return;

      const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      // Deduplica
      if (articoli.some(a => a.href === url)) return;

      const dataTesto = cardBody.find(".card-label-date").first().text().trim();
      const data = dataTesto ? parseData(dataTesto) : undefined;

      articoli.push({ titolo, href: url, data });
    });
  }

  if (articoli.length === 0) return [];

  // Limita a 15 articoli per evitare timeout
  const daFetchare = articoli.slice(0, 15);
  const risultati: BandoRaw[] = [];

  for (const { titolo, href, data } of daFetchare) {
    const descrizione = await fetchDescrizione(href);
    risultati.push({
      titolo,
      ente: ENTE,
      fonteUrl: FONTE_URL,
      bandoUrl: href,
      descrizione,
      dataApertura: data,
    });
  }

  return risultati;
}
