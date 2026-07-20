import * as cheerio from "cheerio";
import type { BandoRaw, RisultatoFonte } from "./types";
import { estraiCampiBando } from "../estrazione-ai";

const BASE_URL = "https://www.conferenzastatocitta.gov.it";
const FONTE_URL = `${BASE_URL}/home/notizie-e-comunicati/2026/`;
const ENTE = "Conferenza Stato-Città";

// Pre-filtro grezzo sui titoli in pagina di listing: serve solo a decidere quali articoli valga
// la pena aprire in dettaglio (evita una chiamata AI su ogni singola notizia, anche quelle
// palesemente non bandi). Il titolo/descrizione/scadenza/ambito finali del bando vengono sempre
// dall'estrazione AI sulla pagina di dettaglio (vedi sotto), non da questo testo — quindi un
// titolo di card diventato un CTA generico o comunque impreciso qui non causa più un dato errato
// in output, al massimo un mancato fetch di un articolo genuinamente rilevante.
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

// Testo pulito dell'intera pagina di dettaglio (header/nav/footer/script rimossi), passato
// all'estrazione AI — niente più selettori mirati a un contenitore specifico che può sparire o
// cambiare a ogni redesign del sito.
async function fetchTestoPagina(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    const $ = cheerio.load(html);
    $("header, footer, nav, script, style, noscript").remove();
    const testo = $("body").text().replace(/\s+/g, " ").trim();
    return testo || undefined;
  } catch {
    return undefined;
  }
}

export async function parseConferenzaStatoCitta(): Promise<RisultatoFonte> {
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

  if (articoli.length === 0) return { bandi: [], candidati: 0, estratti: 0, nonBando: 0, falliti: 0 };

  // Limita a 15 articoli per evitare timeout
  const daFetchare = articoli.slice(0, 15);
  const bandi: BandoRaw[] = [];
  let estratti = 0, nonBando = 0, falliti = 0;

  // Concorrenza limitata (stesso pattern di UPEL): in sequenza, fino a 15 fetch+estrazioni
  // rischiano di avvicinarsi troppo al tetto di durata del cron sommate alle altre fonti.
  const CONCORRENZA = 6;
  let indice = 0;
  async function worker() {
    while (indice < daFetchare.length) {
      const { href, data } = daFetchare[indice++];
      const testo = await fetchTestoPagina(href);
      if (!testo) { falliti++; continue; } // pagina irraggiungibile: meglio saltarla che salvare un dato vuoto

      const esito = await estraiCampiBando(testo, { ente: ENTE });
      if (esito.esito === "errore") { falliti++; continue; }
      if (esito.esito === "non_bando") { nonBando++; continue; }

      estratti++;
      const campi = esito.campi;
      bandi.push({
        titolo: campi.titolo,
        ente: ENTE,
        fonteUrl: FONTE_URL,
        bandoUrl: href,
        descrizione: campi.descrizione,
        dotazione: campi.dotazione,
        beneficiari: campi.beneficiari,
        dataApertura: data,
        dataChiusura: campi.dataChiusura ? new Date(campi.dataChiusura) : undefined,
        ambitoTerritoriale: campi.ambitoTerritoriale,
        sogliaPopolazione: campi.sogliaPopolazione,
        tipoBeneficiario: campi.tipoBeneficiario,
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCORRENZA, daFetchare.length) }, worker));

  return { bandi, candidati: daFetchare.length, estratti, nonBando, falliti };
}
