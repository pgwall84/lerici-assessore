import * as cheerio from "cheerio";
import type { BandoRaw } from "./types";

const FONTE_URL = "https://www.x-desk.it/infobandi/";
const ENTE = "x-desk Info Bandi";

// Suffissi di categoria appesi al titolo nella TD (es. "Bando ZenitContributi Nazionali")
const SUFFISSI_CATEGORIA = [
  "Contributi Regionali", "Contributi Nazionali", "Fondi Strutturali", "PNRR", "Altro",
];

// Regioni italiane esplicite nel campo Ambito → bando non nazionale → escludi
const REGIONI_ESCLUSE_PATTERN = [
  /^regione (lombardia|piemonte|veneto|toscana|emilia|sicilia|campania|puglia|calabria|lazio|marche|umbria|abruzzo|molise|basilicata|friuli|trentino|sardegna)/i,
  /^pr (fse|fesr)\+/i,  // programmi regionali specifici
  /comuni lombardi|comuni piemontesi|comuni veneti|comuni toscani|comuni sardi/i,
  /regione autonoma friuli/i,
  /regione autonoma sardegna/i,
  /regione valle d'aosta/i,
];

function isEsclusoDiAltraRegione(ambito: string): boolean {
  const a = ambito.trim();
  return REGIONI_ESCLUSE_PATTERN.some(re => re.test(a));
}

function parseDataScadenza(testo: string): Date | undefined {
  const m = testo.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return undefined;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function pulisciTitolo(raw: string): string {
  let t = raw.trim();
  for (const suf of SUFFISSI_CATEGORIA) {
    if (t.endsWith(suf)) {
      t = t.slice(0, -suf.length).trim();
      break;
    }
  }
  return t;
}

export async function parseXdeskInfobandi(): Promise<BandoRaw[]> {
  const res = await fetch(FONTE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`x-desk Info Bandi: HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const risultati: BandoRaw[] = [];

  $("table tr").each((_, row) => {
    const tds = $(row).find("td");
    if (tds.length !== 7) return; // salta header (<th>) e righe spurie

    // TD[0] = colore (marker), TD[1] = Titolo, TD[2] = Area, TD[3] = Link, TD[4] = Descrizione, TD[5] = Scadenza, TD[6] = Ambito
    const titoloRaw = tds.eq(1).text().trim();
    if (!titoloRaw || titoloRaw === "Titolo") return; // salta riga intestazione

    const titolo = pulisciTitolo(titoloRaw);
    if (titolo.length < 5) return;

    const ambito = tds.eq(6).text().trim();
    if (isEsclusoDiAltraRegione(ambito)) return;

    const bandoUrl = tds.eq(3).find("a").attr("href")?.trim()
      || tds.eq(3).text().trim()
      || undefined;

    const descrizione = tds.eq(4).text().trim().slice(0, 500) || undefined;
    const scadenzaRaw = tds.eq(5).text().trim();
    const dataChiusura = parseDataScadenza(scadenzaRaw);
    const areaTematica = tds.eq(2).text().trim();

    // Dotazione: cifra in ambito
    const dotazioneMatch = ambito.match(/[\d,.]+ (?:milion[ei] di euro|milioni|mila euro|euro)/i);
    const dotazione = dotazioneMatch ? dotazioneMatch[0] : undefined;

    risultati.push({
      titolo: titolo.slice(0, 250),
      ente: ENTE,
      fonteUrl: FONTE_URL,
      bandoUrl,
      descrizione,
      dotazione,
      beneficiari: areaTematica || undefined,
      dataChiusura,
    });
  });

  if (risultati.length === 0) {
    throw new Error("x-desk Info Bandi: nessun bando estratto (possibile cambio struttura HTML)");
  }

  return risultati;
}
