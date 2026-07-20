import type { BandoRaw } from "./fonti/types";

// Tutte le fonti attive (lib/bandi/index.ts → FONTI) sono convertite a estrazione via AI
// (lib/bandi/estrazione-ai.ts) e valorizzano sempre ambitoTerritoriale: un campo strutturato a
// set chiuso, deciso leggendo il contenuto della pagina invece che regex/host URL che possono
// puntare al posto sbagliato senza errore visibile — il bug che ha motivato questa conversione
// (vedi UPEL/Conferenza Stato-Città). Se una fonte non convertita viene riattivata (es. ANCI
// Nazionale) senza passare da estrazione-ai.ts, ambitoTerritoriale resta undefined: si tiene per
// default, stessa filosofia di sempre — meglio includere un dubbio che perdere un bando utile.
export function isBandoRilevante(raw: BandoRaw): boolean {
  return raw.ambitoTerritoriale !== "altra_regione";
}
