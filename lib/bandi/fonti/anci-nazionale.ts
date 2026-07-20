import type { BandoRaw } from "./types";
import he from "he";

const FONTE_URL = "https://www.anci.it/category/finanziamenti/";
const ENTE = "ANCI Nazionale";

// Categorie WP: 88 = Bandi e Progetti, 4231 = Info risorse e investimenti – Avvisi e Decreti per Comuni
const WP_API = "https://www.anci.it/wp-json/wp/v2/posts?categories=88,4231&per_page=20&orderby=date&order=desc&_fields=id,title,link,date,excerpt";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function parseAnciNazionale(): Promise<BandoRaw[]> {
  const res = await fetch(WP_API, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`ANCI Nazionale: HTTP ${res.status}`);

  const posts: Array<{
    title: { rendered: string };
    link: string;
    date: string;
    excerpt: { rendered: string };
  }> = await res.json();

  return posts.map(p => ({
    titolo: he.decode(stripHtml(p.title.rendered)).slice(0, 250),
    ente: ENTE,
    fonteUrl: FONTE_URL,
    bandoUrl: p.link,
    descrizione: stripHtml(he.decode(p.excerpt.rendered)).slice(0, 500) || undefined,
    dataApertura: new Date(p.date),
  }));
}
