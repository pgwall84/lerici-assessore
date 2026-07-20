import * as cheerio from "cheerio";
import type { BandoRaw, RisultatoFonte } from "./types";
import { estraiBatch } from "../estrazione-ai";

const FONTE_URL = "https://www.anciliguria.it/bandi";
const ENTE = "ANCI Liguria";

export async function parseAnciLiguria(): Promise<RisultatoFonte> {
  const res = await fetch(FONTE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`ANCI Liguria: HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Individuazione dei candidati (invariata): un box per bando, con link diretto. Il testo
  // dell'intero box (stato+scadenza+titolo+descrizione) viene passato per intero all'estrazione
  // AI al posto delle regex che prima separavano prefisso/titolo/scadenza a mano.
  const candidati: Array<{ bandoUrl: string; testo: string }> = [];
  $(".european-box").each((_, el) => {
    const bandoUrl = $(el).find("a[href*='/bandi/']").attr("href") ?? "";
    if (!bandoUrl) return;

    // Testo completo del box (senza il link "VEDI DETTAGLIO")
    const testo = $(el).clone()
      .find(".european-in-box-link").remove().end()
      .text().replace(/\s+/g, " ").trim();
    if (testo.length < 10) return;

    candidati.push({ bandoUrl, testo });
  });

  const { risultati, estratti, nonBando, falliti } = await estraiBatch(candidati, ENTE);

  const bandi: BandoRaw[] = risultati.map(({ candidato, campi }) => ({
    titolo: campi.titolo,
    ente: ENTE,
    fonteUrl: FONTE_URL,
    bandoUrl: candidato.bandoUrl,
    descrizione: campi.descrizione,
    dotazione: campi.dotazione,
    beneficiari: campi.beneficiari,
    dataChiusura: campi.dataChiusura ? new Date(campi.dataChiusura) : undefined,
    ambitoTerritoriale: campi.ambitoTerritoriale,
    sogliaPopolazione: campi.sogliaPopolazione,
    tipoBeneficiario: campi.tipoBeneficiario,
  }));

  return { bandi, candidati: candidati.length, estratti, nonBando, falliti };
}
