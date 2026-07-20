import type { BandoRaw } from "./fonti/types";

// Domini URL di portali regionali non-Liguria (segnale forte: il bando è di quella regione)
const DOMINI_REGIONALI_ESCLUSI = [
  "bandi.regione.lombardia.it",
  "bandi.regione.veneto.it",
  "regione.fvg.it",
  "regione.piemonte.it",
  "regione.toscana.it",
  "regione.sicilia.it",
  "regione.sardegna.it",
  "regione.puglia.it",
  "regione.calabria.it",
  "regione.campania.it",
  "regione.marche.it",
  "regione.umbria.it",
  "regione.abruzzo.it",
  "regione.molise.it",
  "regione.basilicata.it",
  "regione.vda.it",
  "regione.taa.it",
  "regione.emiliaromagna.it",
  "bandi.regione.sardegna.it",
  "www.regione.lazio.it",
];

// Nomi propri delle regioni non-Liguria (per matching con preposizioni e aggettivi)
const NOMI_REGIONI = [
  "lombardia", "piemonte", "veneto", "toscana", "sicilia", "sardegna",
  "puglia", "calabria", "campania", "lazio", "marche", "umbria",
  "abruzzo", "molise", "basilicata", "friuli", "trentino", "valle d.aosta",
  "emilia.romagna", "emilia romagna",
];

// Aggettivi regionali (es. "musei lombardi", "operatori veneti")
const AGGETTIVI_REGIONALI = [
  "lombardi?", "piemontesi?", "veneti?", "toscani?", "siciliani?", "sardi?",
  "pugliesi?", "calabresi?", "campani?", "laziali?", "marchigiani?", "umbri?",
  "abruzzesi?", "friulani?", "sardi?",
];

const _reNomi = new RegExp(
  `\\b(?:regione|nel|in |del |della |della regione |nel territorio |operanti (?:nel|in)|per (?:il|la) )\\s*(${NOMI_REGIONI.join("|")})\\b`,
  "i"
);
const _reAggettivi = new RegExp(
  `\\b(?:comuni|enti|musei|archivi|biblioteche|imprese|soggetti|operatori|istituzioni|scuole|istituti)\\s+(${AGGETTIVI_REGIONALI.join("|")})\\b`,
  "i"
);

// Regex che identificano un riferimento esplicito a una regione non-Liguria nel testo
const PATTERN_REGIONI_ESCLUSE: RegExp[] = [
  _reNomi,
  _reAggettivi,
  /\bprodotti siciliani\b/i,
  /\bgal (valli|del ducato|lodi|colline|langhe|monferrat|appennino|terre|sebino)/i,
  /\baqst\b/i,
  /\bpr (fse|fesr)\+?\s*202[0-9]-202[0-9]/i,
];

// Keyword che confermano il bando è nazionale o rilevante per Liguria → NON escludere
const PATTERN_NAZIONALI = [
  /\bnazional[ei]\b/i,
  /\bpnrr\b/i,
  /\bliguria\b/i,
  /\btutti i comuni\b/i,
  /\benti locali\b/i,
  /\bcomuni italiani\b/i,
  /\bministero\b/i,
  /\bdipartimento\b/i,
  /\bpresidenza del consiglio\b/i,
  /\bgoverno italiano\b/i,
  /\bfondo republic/i,
  /\bpa digitale\b/i,
  /\binfratel\b/i,
];

// Keyword negativo per ANCI Nazionale: articoli che sono notizie/eventi, non bandi aperti
const PATTERN_NON_BANDO = [
  /\bregistrazione del webinar\b/i,
  /\bpresentazione del portale\b/i,
  /\binaugura\b/i,
  /\balle ore \d{1,2}[\.:]\d{2}\b/i,
  /\bfocus sulla manovra\b/i,
  /\bdomani a fuori dal comune\b/i,
  /\bmonitoraggio: dalla diagnosi\b/i,
  /\bwebinar anci\b/i,
];

function urlHost(url?: string): string {
  if (!url) return "";
  try { return new URL(url).hostname.toLowerCase(); } catch { return url.toLowerCase(); }
}

export function isBandoRilevante(raw: BandoRaw): boolean {
  const testo = `${raw.titolo} ${raw.descrizione ?? ""} ${raw.beneficiari ?? ""}`;
  const host = urlHost(raw.bandoUrl);

  // Esclusione per URL regionale non-Liguria (segnale molto forte)
  if (DOMINI_REGIONALI_ESCLUSI.some(d => host.includes(d))) return false;

  // Esclusione per keyword non-bando (notizie/eventi/webinar)
  if (PATTERN_NON_BANDO.some(re => re.test(raw.titolo))) return false;

  // Se il testo contiene un marcatore nazionale → teniamo sempre
  if (PATTERN_NAZIONALI.some(re => re.test(testo))) return true;

  // Se il testo cita esplicitamente un'altra regione → escludi
  if (PATTERN_REGIONI_ESCLUSE.some(re => re.test(testo))) return false;

  // Altrimenti → teniamo (meglio includere qualcosa di dubbio che perdere un bando utile)
  return true;
}
