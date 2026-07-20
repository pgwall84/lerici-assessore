import * as cheerio from "cheerio";
import { isBandoRilevante } from "../lib/bandi/filtro-territoriale";

const URL = "https://www.upel.va.it/it/news/bando--musei-archivi-e-biblioteche";

const REGIONI_ESCLUSE = [
  "sardegna", "lombard", "piemonte", "veneto", "toscana", "emilia.romagna",
  "sicilia", "campania", "puglia", "calabria", "lazio", "marche",
  "umbria", "abruzzo", "molise", "basilicata", "friuli", "trentino",
  "valle d'aosta",
];

function isEsclusoDiAltraRegione(testo: string): boolean {
  const lower = testo.toLowerCase();
  if (lower.includes("nazionale") || lower.includes("liguria")) return false;
  return REGIONI_ESCLUSE.some(r => lower.includes(r));
}

function estraiDopoStrong(html: string, label: string): string {
  const re = new RegExp(`<strong[^>]*>${label}[^<]*<\\/strong>([\\s\\S]*?)(?=<strong|$)`, "i");
  const m = html.match(re);
  if (!m) return "";
  return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function main() {
  const res = await fetch(URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const mainEl = $("article, .field-items, .field-body, main, #content, .content, .content-inner").first();
  console.log("mainEl trovato:", mainEl.length > 0);

  const bodyHtml = (mainEl.length ? mainEl : $("body")).html() ?? html;
  const testoCompleto = bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();

  console.log("testoCompleto length:", testoCompleto.length);
  console.log("contiene 'veneto':", testoCompleto.includes("veneto"));
  console.log("contiene 'nazionale':", testoCompleto.includes("nazionale"));
  console.log("contiene 'liguria':", testoCompleto.includes("liguria"));

  console.log("\nisEsclusoDiAltraRegione:", isEsclusoDiAltraRegione(testoCompleto));

  // Cosa estraiamo come beneficiari?
  const beneficiari = estraiDopoStrong(bodyHtml, "A CHI[^<]*RIVOLTO");
  console.log("\nbenefficiari estratti:", beneficiari.slice(0, 200));

  // Cosa dice isBandoRilevante con i campi estratti?
  const raw = {
    titolo: "Bando | Musei, Archivi e Biblioteche",
    ente: "UPEL",
    fonteUrl: "https://www.upel.va.it/it/bandi-e-finanziamenti-per-enti-locali",
    bandoUrl: URL,
    beneficiari: beneficiari || undefined,
  };
  console.log("\nisBandoRilevante:", isBandoRilevante(raw));

  // Posizione di "veneto" nel testo
  const idx = testoCompleto.indexOf("veneto");
  console.log("\n'veneto' a indice", idx, ":", testoCompleto.slice(Math.max(0, idx-30), idx+50));
}
main().catch(console.error);
