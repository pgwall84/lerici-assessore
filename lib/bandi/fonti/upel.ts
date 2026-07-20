import * as cheerio from "cheerio";
import type { BandoRaw } from "./types";

const FONTE_URL = "https://www.upel.va.it/it/bandi-e-finanziamenti-per-enti-locali";
const BASE_URL = "https://www.upel.va.it";
const ENTE = "UPEL";

// Regioni italiane esplicite da escludere (bandi rivolti solo a quella regione)
// Non filtriamo "nazionale" o "Liguria" — quelli vanno tenuti
const REGIONI_ESCLUSE = [
  "sardegna", "lombard", "piemonte", "veneto", "toscana", "emilia.romagna",
  "sicilia", "campania", "puglia", "calabria", "lazio", "marche",
  "umbria", "abruzzo", "molise", "basilicata", "friuli", "trentino",
  "valle d'aosta", "comuni sardi", "comuni lombardi", "comuni piemontesi",
  "comuni veneti", "comuni toscani",
];

function isEsclusoDiAltraRegione(testo: string): boolean {
  const lower = testo.toLowerCase();
  // Se menziona "nazionale" o "liguria" → teniamo
  if (lower.includes("nazionale") || lower.includes("liguria")) return false;
  return REGIONI_ESCLUSE.some(r => lower.includes(r));
}

function parseData(testo: string): Date | undefined {
  const mesi: Record<string, number> = {
    gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5,
    luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11,
  };
  // "27 luglio 2026" o "27/07/2026"
  const m1 = testo.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m1) return new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
  const m2 = testo.match(/(\d{1,2})\s+([a-zà-ù]+)\s+(\d{4})/i);
  if (m2) {
    const mese = mesi[m2[2].toLowerCase()];
    if (mese !== undefined) return new Date(Number(m2[3]), mese, Number(m2[1]));
  }
  return undefined;
}

function estraiDopoStrong(html: string, label: string): string {
  // Cerca <strong>LABEL</strong> e prende il testo subito dopo fino al prossimo <strong>
  const re = new RegExp(`<strong[^>]*>${label}[^<]*<\\/strong>([\\s\\S]*?)(?=<strong|$)`, "i");
  const m = html.match(re);
  if (!m) return "";
  return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchDettaglio(url: string): Promise<Partial<BandoRaw> & { testoCompleto: string; ok: boolean }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return { testoCompleto: "", ok: false };
  const html = await res.text();
  const $ = cheerio.load(html);

  // Solo il contenuto principale (esclude header/footer/nav che contengono "nazionale", "liguria" ecc.).
  // Se il sito ha cambiato struttura e nessuno di questi selettori trova nulla, NON si deve mai
  // cadere sul body intero: nav/footer del sito contengono menzioni di altre regioni (visto un
  // caso reale in cui questo fallback faceva scartare come "fuori Liguria" ogni singolo bando,
  // inclusi quelli nazionali, per una parola nel menu). Meglio trattare la pagina come "ambito
  // territoriale non verificabile" e scartarla, che rischiare un falso negativo silenzioso.
  // ".news_dett" è il contenitore attuale del dettaglio bando (verificato luglio 2026 su più
  // pagine); i selettori seguenti erano quelli della struttura precedente, tenuti come fallback
  // nel caso il sito torni a un layout simile — non è mai stato verificato che matchino oggi.
  const mainEl = $(".news_dett, article, .field-items, .field-body, main, #content, .content-inner").first();
  if (mainEl.length === 0) return { testoCompleto: "", ok: false };
  const bodyHtml = mainEl.html() ?? "";

  // Testo del solo contenuto principale per filtro territoriale
  const testoCompleto = bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();

  const descrizioneParagrafi = estraiDopoStrong(bodyHtml, "A CHI[^<]*RIVOLTO");
  const dotazioneRaw = estraiDopoStrong(bodyHtml, "ENTITÀ[^<]*|AGEVOLAZIONE[^<]*|DOTAZIONE[^<]*");
  const scadenzaRaw = estraiDopoStrong(bodyHtml, "SCADENZA[^<]*");

  // Dotazione: estrai la cifra
  const dotazioneMatch = dotazioneRaw.match(/[\d.,]+\s*(milion[ei]|mila|euro|mld)?/i)
    ?? testoCompleto.match(/dotazione[^€\d]*([\d.,]+\s*(?:milion[ei]|mila|euro)?)/i);
  const dotazione = dotazioneMatch ? dotazioneMatch[0].trim().slice(0, 200) : undefined;

  // Scadenza: estrai data
  const dataChiusura = parseData(scadenzaRaw) ?? parseData(
    testoCompleto.match(/scadenz[ae][^0-9]{0,10}(\d{1,2}[\/\s][a-zà-ù\d\/\-]+\d{4})/i)?.[1] ?? ""
  );

  const beneficiari = descrizioneParagrafi.slice(0, 300) || undefined;

  // Descrizione: primo paragrafo significativo
  let descrizione = "";
  $("p").each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 60 && !descrizione) descrizione = t.slice(0, 500);
  });

  return { descrizione: descrizione || undefined, dotazione, dataChiusura, beneficiari, testoCompleto, ok: true };
}

export async function parseUpel(): Promise<BandoRaw[]> {
  const res = await fetch(FONTE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`UPEL: HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Raccoglie tutti i link bando dalla pagina listing
  const links: Array<{ titolo: string; href: string }> = [];
  $("a[href*='/it/news/bando']").each((_, el) => {
    const titolo = $(el).find("span").text().trim() || $(el).text().trim();
    const href = $(el).attr("href") ?? "";
    if (titolo.length < 5 || !href) return;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    // Deduplica
    if (!links.some(l => l.href === url)) {
      links.push({ titolo, href: url });
    }
  });

  if (links.length === 0) throw new Error("UPEL: nessun bando trovato nella pagina listing");

  // Limita a 40 bandi max per non saturare la durata massima della function su Vercel
  const daFetchare = links.slice(0, 40);

  const risultati: BandoRaw[] = [];

  // Fetch a concorrenza limitata (non tutto in sequenza — 40 fetch uno alla volta impiegano
  // oltre un minuto, troppo per una cron function — ma nemmeno tutti insieme, per non bombardare
  // il server sorgente con 40 richieste simultanee)
  const CONCORRENZA = 6;
  let indice = 0;
  async function worker() {
    while (indice < daFetchare.length) {
      const { titolo, href } = daFetchare[indice++];
      try {
        const dettaglio = await fetchDettaglio(href);
        // Se il fetch del dettaglio è fallito (HTTP o ambito territoriale non verificabile),
        // saltiamo: meglio perdere un giro che salvare un bando non filtrato
        if (!dettaglio.ok) continue;
        // Filtra bandi esplicitamente regionali per altre regioni
        if (isEsclusoDiAltraRegione(dettaglio.testoCompleto)) continue;

        risultati.push({
          titolo,
          ente: ENTE,
          fonteUrl: FONTE_URL,
          bandoUrl: href,
          descrizione: dettaglio.descrizione,
          dotazione: dettaglio.dotazione,
          beneficiari: dettaglio.beneficiari,
          dataChiusura: dettaglio.dataChiusura,
        });
      } catch {
        // fetchDettaglio non dovrebbe lanciare (ha try/catch interno), ma per sicurezza saltiamo
        continue;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCORRENZA, daFetchare.length) }, worker));

  return risultati;
}
