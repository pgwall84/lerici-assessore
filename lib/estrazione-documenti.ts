import mammoth from "mammoth";
import AdmZip from "adm-zip";

const REGEX_ODG = /ordine.?del.?giorno|^odg|o\.d\.g/i;

export function estraiVociZip(buffer: Buffer): { nomeFile: string; buffer: Buffer }[] {
  const zip = new AdmZip(buffer);
  return zip.getEntries()
    .filter(e => !e.isDirectory)
    .map(e => ({ nomeFile: e.entryName.split("/").pop() ?? e.entryName, buffer: e.getData() }));
}

/** Individua l'unico file dello zip il cui nome corrisponde all'euristica ODG, se univoco. */
export function trovaOdgInZip(voci: { nomeFile: string }[]): number | null {
  const candidati = voci.map((v, i) => ({ i, match: REGEX_ODG.test(v.nomeFile) })).filter(v => v.match);
  return candidati.length === 1 ? candidati[0].i : null;
}

export async function estraiTestoDaFile(buffer: Buffer, nomeFile: string): Promise<string> {
  const ext = nomeFile.toLowerCase().split(".").pop() ?? "";

  if (ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }

  if (ext === "docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return value.trim();
  }

  // RTF e altri formati marginali: best-effort, nessuna libreria robusta standard —
  // l'estrazione resta vuota e il file originale rimane comunque scaricabile da Storage.
  return "";
}
