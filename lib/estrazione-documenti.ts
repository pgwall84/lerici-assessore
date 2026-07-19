import mammoth from "mammoth";
import AdmZip from "adm-zip";

const REGEX_ODG = /ordine.?del.?giorno|^odg|o\.d\.g/i;

const CONTENT_TYPE_PER_ESTENSIONE: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  rtf: "application/rtf",
  zip: "application/zip",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

/** Content-Type da associare all'oggetto Storage in base all'estensione del nome file. */
export function contentTypeDaNomeFile(nomeFile: string): string {
  const ext = nomeFile.toLowerCase().split(".").pop() ?? "";
  return CONTENT_TYPE_PER_ESTENSIONE[ext] ?? "application/octet-stream";
}

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
    // pdf-parse v1: puro JS, nessuna dipendenza canvas/DOM — v2 dipende da @napi-rs/canvas
    // (binario nativo) che in ambiente serverless Vercel non si carica sempre correttamente,
    // facendo cadere pdfjs-dist in un percorso che richiede DOMMatrix (API browser, non Node).
    const pdf = (await import("pdf-parse")).default;
    const result = await pdf(buffer);
    return result.text.trim();
  }

  if (ext === "docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return value.trim();
  }

  // RTF e altri formati marginali: best-effort, nessuna libreria robusta standard —
  // l'estrazione resta vuota e il file originale rimane comunque scaricabile da Storage.
  return "";
}
