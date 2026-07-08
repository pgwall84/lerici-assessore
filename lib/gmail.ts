import { google } from "googleapis";
import { simpleParser } from "mailparser";
import { supabase } from "@/lib/supabase";
import iconv from "iconv-lite";
import he from "he";

function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return auth;
}

export async function getOrCreateLabel(name: string): Promise<string> {
  const gmail = google.gmail({ version: "v1", auth: getAuth() });
  const res = await gmail.users.labels.list({ userId: "me" });
  const existing = res.data.labels?.find(l => l.name === name);
  if (existing?.id) return existing.id;
  const created = await gmail.users.labels.create({ userId: "me", requestBody: { name } });
  return created.data.id!;
}

export async function getMailsSegnalazioni(): Promise<MailImport[]> {
  const gmail = google.gmail({ version: "v1", auth: getAuth() });

  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  const labelSegnalazioni = labelsRes.data.labels?.find(l => l.name === "Segnalazioni");
  if (!labelSegnalazioni?.id) return [];
  const labelImportata = labelsRes.data.labels?.find(l => l.name === "Importata");

  const listRes = await gmail.users.messages.list({
    userId: "me",
    labelIds: [labelSegnalazioni.id],
    maxResults: 20,
  });

  const messages = listRes.data.messages ?? [];
  const risultati: MailImport[] = [];

  for (const msg of messages) {
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id!,
      format: "full",
    });
    const data = full.data;

    if (labelImportata?.id && data.labelIds?.includes(labelImportata.id)) continue;

    const headers = data.payload?.headers ?? [];
    const oggettoOriginale = headers.find(h => h.name === "Subject")?.value ?? "";
    const mittenteOriginale = headers.find(h => h.name === "From")?.value ?? "";
    const dataMail = headers.find(h => h.name === "Date")?.value ?? "";

    // Cerca allegato postacert.eml
    const postacertPart = trovaParte(data.payload, "postacert.eml");

    let titolo = pulisciOggetto(oggettoOriginale);
    let descrizione = "";
    let nomeMittente = estraiNomeMittente(mittenteOriginale);
    let emailMittente = estraiEmailMittente(mittenteOriginale);
    let protocollo = "";
    let dataProtocollo = "";
    let allegati: { buffer: Buffer; filename: string; contentType: string }[] = [];

    if (postacertPart?.body?.attachmentId) {
      // Scarica il postacert.eml
      const att = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: msg.id!,
        id: postacertPart.body.attachmentId,
      });
      const emlBuffer = Buffer.from(att.data.data!, "base64url");

      // Parsa per allegati e subject (mailparser gestisce base64/binary correttamente)
      const parsed = await simpleParser(emlBuffer);

      // Estrae manualmente il body HTML dal MIME del postacert.eml con decodifica QP + windows-1252
      // (PEC dichiara charset=us-ascii ma scrive bytes windows-1252 — mailparser non sa gestirlo)
      const testoEml = stripHtml(estraiHtmlDaMime(emlBuffer));

      // Mittente reale
      const matchNome = testoEml.match(/Mittente\s*:\s*(.+)/i);
      const matchEmail = testoEml.match(/Mail\s+mittente\s*:\s*(.+)/i);
      if (matchNome?.[1]) nomeMittente = matchNome[1].trim();
      if (matchEmail?.[1]) emailMittente = matchEmail[1].trim();

      // Protocollo e data: "Protocollo n. 24546 del 02-07-2026"
      const matchProtocollo = testoEml.match(/Protocollo\s+n\.?\s*(\d+)\s+del\s+([\d\-\/]+)/i);
      if (matchProtocollo) {
        protocollo = matchProtocollo[1].trim();
        dataProtocollo = matchProtocollo[2].trim();
      }

      // Usa parsed.subject del postacert.eml (MIME encoded-word, decodificato correttamente da mailparser)
      // Il body HTML è corrotto da Poste Italiane (&#65533; per le accentate)
      if (parsed.subject) {
        titolo = pulisciOggetto(parsed.subject);
      } else {
        const matchOggetto = testoEml.match(/Oggetto\s*:\s*(.+)/i);
        if (matchOggetto?.[1]) titolo = pulisciOggetto(matchOggetto[1]);
      }

      // Fallback mittente: from header dell'EML
      if (!matchNome) {
        const fromAddr = parsed.from?.value?.[0];
        if (fromAddr) {
          nomeMittente = fromAddr.name || fromAddr.address || nomeMittente;
          emailMittente = fromAddr.address || emailMittente;
        }
      }

      // Testo: cerca allegato HTML "testo mail"
      const htmlAllegato = parsed.attachments?.find(a =>
        a.filename?.toLowerCase().includes("testo") ||
        a.contentType === "text/html"
      );
      if (htmlAllegato?.content) {
        // Rileva charset dal content-type dell'allegato o dall'interno dell'HTML
        const ctAllegato = htmlAllegato.contentType ?? "";
        const csMatch = ctAllegato.match(/charset=["']?([^"';\s]+)/i);
        let cs = csMatch?.[1] ?? "";
        // Cerca anche nel meta charset dentro l'HTML se non trovato
        if (!cs) {
          const raw = htmlAllegato.content.toString("latin1");
          const metaCs = raw.match(/charset=["']?([^"';\s>]+)/i);
          cs = metaCs?.[1] ?? "windows-1252";
        }
        const html = iconv.encodingExists(cs)
          ? iconv.decode(htmlAllegato.content as Buffer, cs)
          : htmlAllegato.content.toString("utf-8");
        descrizione = stripHtml(html).slice(0, 1500);
      } else if (parsed.text) {
        descrizione = parsed.text.trim().slice(0, 1500);
      } else if (parsed.html) {
        descrizione = stripHtml(parsed.html).slice(0, 1500);
      }

      // Foto e PDF allegati
      const tipiAmmessi = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
      allegati = (parsed.attachments ?? [])
        .filter(a => tipiAmmessi.includes(a.contentType) && a.content)
        .slice(0, 5)
        .map(a => ({
          buffer: a.content as Buffer,
          filename: a.filename ?? `foto-${Date.now()}.jpg`,
          contentType: a.contentType,
        }));
    } else {
      // Nessun postacert.eml — usa corpo principale
      descrizione = estraiCorpoPrincipale(data.payload).slice(0, 1500);
    }

    risultati.push({
      messageId: msg.id!,
      oggettoOriginale,
      mittente: mittenteOriginale,
      data: dataMail,
      titolo,
      descrizione,
      nomeMittente,
      emailMittente,
      protocollo,
      dataProtocollo,
      allegati,
    });
  }

  return risultati;
}

export async function caricaAllegatiMail(
  allegati: { buffer: Buffer; filename: string; contentType: string }[],
  praticaId: number,
): Promise<string[]> {
  const urls: string[] = [];
  for (const allegato of allegati) {
    const ext = allegato.contentType.includes("pdf") ? "pdf"
      : allegato.contentType.includes("png") ? "png"
      : allegato.contentType.includes("gif") ? "gif"
      : "jpg";
    const filename = `pratica-${praticaId}-mail-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("foto").upload(filename, allegato.buffer, {
      contentType: allegato.contentType,
      upsert: false,
    });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from("foto").getPublicUrl(filename);
      urls.push(publicUrl);
    }
  }
  return urls;
}

export async function marcaImportata(messageId: string): Promise<void> {
  const gmail = google.gmail({ version: "v1", auth: getAuth() });
  const labelId = await getOrCreateLabel("Importata");
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { addLabelIds: [labelId] },
  });
}

export async function spostaInChiusa(messageId: string): Promise<void> {
  const gmail = google.gmail({ version: "v1", auth: getAuth() });
  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  const labels = labelsRes.data.labels ?? [];

  const labelChiusa = labels.find(l => l.name === "Segnalazioni/Chiusa");
  const labelSegnalazioni = labels.find(l => l.name === "Segnalazioni");
  const labelImportata = labels.find(l => l.name === "Importata");

  const addLabelIds: string[] = [];
  const removeLabelIds: string[] = [];

  if (labelChiusa?.id) addLabelIds.push(labelChiusa.id);
  if (labelSegnalazioni?.id) removeLabelIds.push(labelSegnalazioni.id);
  if (labelImportata?.id) removeLabelIds.push(labelImportata.id);

  if (!addLabelIds.length && !removeLabelIds.length) return;

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { addLabelIds, removeLabelIds },
  });
}

export async function rimuoviImportata(messageId: string): Promise<void> {
  const gmail = google.gmail({ version: "v1", auth: getAuth() });
  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  const labelImportata = labelsRes.data.labels?.find(l => l.name === "Importata");
  if (!labelImportata?.id) return;
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { removeLabelIds: [labelImportata.id] },
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

function pulisciOggetto(soggetto: string): string {
  let s = he.decode(soggetto.trim());
  // Formato "Mitt:... - POSTA CERTIFICATA: testo" oppure solo "POSTA CERTIFICATA: testo"
  const pecMatch = s.match(/(?:POSTA CERTIFICATA|ANOMALIA MESSAGGIO)\s*:\s*(.+)/i);
  if (pecMatch) {
    s = pecMatch[1].trim();
  }
  // Rimuovi prefissi vari prima del contenuto reale
  s = s.replace(/^(mitt\s*:[^-]+-\s*)?(sollecito\s*:?\s*)?(fwd?\s*:?\s*)*(re\s*:\s*)*/i, "").trim();
  return s.trim().slice(0, 120);
}

function estraiNomeMittente(from: string): string {
  const m = from.match(/^([^<]+)</);
  return m?.[1]?.trim() ?? from;
}

function estraiEmailMittente(from: string): string {
  const m = from.match(/<(.+?)>/);
  return m?.[1] ?? from;
}

function trovaParte(payload: any, filename: string): any {
  if (!payload) return null;
  const fn = payload.filename ?? "";
  if (fn.toLowerCase().includes(filename.toLowerCase())) return payload;
  for (const part of payload.parts ?? []) {
    const found = trovaParte(part, filename);
    if (found) return found;
  }
  return null;
}

function decodePart(data: string, mimeType: string, headers: any[]): string {
  const buf = Buffer.from(data, "base64url");
  const ctHeader = headers?.find((h: any) => h.name?.toLowerCase() === "content-type")?.value ?? "";
  const charsetMatch = ctHeader.match(/charset=["']?([^"';\s]+)/i);
  const charset = charsetMatch?.[1]?.toLowerCase() ?? "windows-1252";
  const text = iconv.encodingExists(charset)
    ? iconv.decode(buf, charset)
    : buf.toString("utf-8");
  return mimeType === "text/html" ? stripHtml(text) : text;
}

function estraiCorpoPrincipale(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    return decodePart(payload.body.data, payload.mimeType ?? "", payload.headers ?? []);
  }
  for (const part of payload.parts ?? []) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodePart(part.body.data, "text/plain", part.headers ?? []);
    }
  }
  for (const part of payload.parts ?? []) {
    const sub = estraiCorpoPrincipale(part);
    if (sub) return sub;
  }
  return "";
}

function estraiHtmlDaMime(emlBuffer: Buffer): string {
  const raw = emlBuffer.toString("binary");

  // Trova boundary multipart
  const bMatch = raw.match(/boundary="([^"]+)"/i);
  if (!bMatch) return "";
  const boundary = bMatch[1];

  const parts = raw.split("--" + boundary);
  for (const part of parts) {
    if (!/Content-Type:\s*text\/html/i.test(part)) continue;
    const isQP = /Content-Transfer-Encoding:\s*quoted-printable/i.test(part);

    // Corpo dopo riga vuota
    const sep = part.match(/\r?\n\r?\n/);
    if (!sep || sep.index === undefined) continue;
    let body = part.slice(sep.index + sep[0].length).replace(/--\s*$/, "").trimEnd();

    if (isQP) {
      body = body
        .replace(/=\r?\n/g, "")
        .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    }
    return iconv.decode(Buffer.from(body, "binary"), "windows-1252");
  }
  return "";
}

function stripHtml(html: string): string {
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return he.decode(text);
}

export type MailImport = {
  messageId: string;
  oggettoOriginale: string;
  mittente: string;
  data: string;
  titolo: string;
  descrizione: string;
  nomeMittente: string;
  emailMittente: string;
  protocollo: string;
  dataProtocollo: string;
  allegati: { buffer: Buffer; filename: string; contentType: string }[];
};
