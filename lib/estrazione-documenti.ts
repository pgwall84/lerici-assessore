import mammoth from "mammoth";

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
