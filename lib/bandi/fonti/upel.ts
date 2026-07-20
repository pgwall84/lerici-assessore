import * as cheerio from "cheerio";
import type { BandoRaw, RisultatoFonte } from "./types";
import { estraiCampiBando } from "../estrazione-ai";

const FONTE_URL = "https://www.upel.va.it/it/bandi-e-finanziamenti-per-enti-locali";
const BASE_URL = "https://www.upel.va.it";
const ENTE = "UPEL";

// Testo del contenitore principale del dettaglio-bando, passato all'estrazione AI. Se il sito ha
// cambiato struttura e nessuno di questi selettori trova nulla, NON si deve mai cadere sul body
// intero: nav/footer del sito contengono menzioni di altre regioni (bug reale osservato: un
// fallback su $("body") faceva scartare ogni bando come "fuori Liguria" per una parola nel menu,
// prima ancora di arrivare qui). Meglio trattare la pagina come fallita e saltarla.
// ".news_dett" è il contenitore attuale (verificato luglio 2026 su più pagine); i selettori
// seguenti erano quelli della struttura precedente, tenuti come fallback nel caso il sito torni a
// un layout simile — non è mai stato verificato che matchino oggi.
async function fetchTestoDettaglio(url: string): Promise<string | undefined> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return undefined;
  const html = await res.text();
  const $ = cheerio.load(html);

  const mainEl = $(".news_dett, article, .field-items, .field-body, main, #content, .content-inner").first();
  if (mainEl.length === 0) return undefined;
  return mainEl.text().replace(/\s+/g, " ").trim() || undefined;
}

export async function parseUpel(): Promise<RisultatoFonte> {
  const res = await fetch(FONTE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`UPEL: HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Raccoglie tutti i link bando dalla pagina listing (il titolo qui è solo un filtro di
  // presenza minima — quello finale del bando viene sempre dall'estrazione AI sulla pagina di
  // dettaglio, vedi sotto)
  const links: string[] = [];
  $("a[href*='/it/news/bando']").each((_, el) => {
    const titolo = $(el).find("span").text().trim() || $(el).text().trim();
    const href = $(el).attr("href") ?? "";
    if (titolo.length < 5 || !href) return;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    if (!links.includes(url)) links.push(url);
  });

  if (links.length === 0) throw new Error("UPEL: nessun bando trovato nella pagina listing");

  // Limita a 40 bandi max per non saturare la durata massima della function su Vercel
  const daFetchare = links.slice(0, 40);

  const risultati: BandoRaw[] = [];
  let estratti = 0, nonBando = 0, falliti = 0;

  // Fetch a concorrenza limitata (non tutto in sequenza — 40 fetch uno alla volta impiegano
  // oltre un minuto, troppo per una cron function — ma nemmeno tutti insieme, per non bombardare
  // il server sorgente con 40 richieste simultanee). Le chiamate a estraiCampiBando() vanno nello
  // stesso worker, stessa concorrenza — Haiku è la stessa scala di costo delle altre integrazioni
  // già in produzione, nessun bisogno di un limite separato.
  const CONCORRENZA = 6;
  let indice = 0;
  async function worker() {
    while (indice < daFetchare.length) {
      const href = daFetchare[indice++];
      try {
        const testo = await fetchTestoDettaglio(href);
        if (!testo) { falliti++; continue; } // fetch fallito o contenitore non trovato

        const esito = await estraiCampiBando(testo, { ente: ENTE });
        if (esito.esito === "errore") { falliti++; continue; }
        if (esito.esito === "non_bando") { nonBando++; continue; }

        estratti++;
        const campi = esito.campi;
        risultati.push({
          titolo: campi.titolo,
          ente: ENTE,
          fonteUrl: FONTE_URL,
          bandoUrl: href,
          descrizione: campi.descrizione,
          dotazione: campi.dotazione,
          beneficiari: campi.beneficiari,
          dataChiusura: campi.dataChiusura ? new Date(campi.dataChiusura) : undefined,
          ambitoTerritoriale: campi.ambitoTerritoriale,
          sogliaPopolazione: campi.sogliaPopolazione,
          tipoBeneficiario: campi.tipoBeneficiario,
        });
      } catch {
        falliti++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCORRENZA, daFetchare.length) }, worker));

  return { bandi: risultati, candidati: daFetchare.length, estratti, nonBando, falliti };
}
