import { google } from "googleapis";
import { simpleParser } from "mailparser";
import { supabase } from "@/lib/supabase";

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
    let fotoData: { buffer: Buffer; filename: string; contentType: string }[] = [];

    if (postacertPart?.body?.attachmentId) {
      // Scarica il postacert.eml
      const att = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: msg.id!,
        id: postacertPart.body.attachmentId,
      });
      const emlBuffer = Buffer.from(att.data.data!, "base64url");

      // Parsa l'EML annidato
      const parsed = await simpleParser(emlBuffer);

      // Mittente reale: cerca nel corpo testuale "Mittente : XXX" e "Mail mittente : xxx"
      const testoEml = parsed.text ?? stripHtml(parsed.html ?? "");
      const matchNome = testoEml.match(/Mittente\s*:\s*(.+)/i);
      const matchEmail = testoEml.match(/Mail\s+mittente\s*:\s*(.+)/i);
      if (matchNome?.[1]) nomeMittente = matchNome[1].trim();
      if (matchEmail?.[1]) emailMittente = matchEmail[1].trim();

      // Fallback: from header dell'EML
      if (!matchNome) {
        const fromAddr = parsed.from?.value?.[0];
        if (fromAddr) {
          nomeMittente = fromAddr.name || fromAddr.address || nomeMittente;
          emailMittente = fromAddr.address || emailMittente;
        }
      }

      // Oggetto reale
      if (parsed.subject) {
        titolo = pulisciOggetto(parsed.subject);
      }

      // Testo: cerca allegato HTML "testo mail"
      const htmlAllegato = parsed.attachments?.find(a =>
        a.filename?.toLowerCase().includes("testo") ||
        a.contentType === "text/html"
      );
      if (htmlAllegato?.content) {
        const html = htmlAllegato.content.toString("utf-8");
        descrizione = stripHtml(html).slice(0, 1500);
      } else if (parsed.text) {
        descrizione = parsed.text.trim().slice(0, 1500);
      } else if (parsed.html) {
        descrizione = stripHtml(parsed.html).slice(0, 1500);
      }

      // Foto allegate
      const imgTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      fotoData = (parsed.attachments ?? [])
        .filter(a => imgTypes.includes(a.contentType) && a.content)
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
      fotoData,
    });
  }

  return risultati;
}

export async function caricaFotoMail(
  fotoData: { buffer: Buffer; filename: string; contentType: string }[],
  praticaId: number,
): Promise<string[]> {
  const urls: string[] = [];
  for (const foto of fotoData) {
    const ext = foto.contentType.includes("png") ? "png" : foto.contentType.includes("gif") ? "gif" : "jpg";
    const filename = `pratica-${praticaId}-mail-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("foto").upload(filename, foto.buffer, {
      contentType: foto.contentType,
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

// ── helpers ──────────────────────────────────────────────────────────────────

function pulisciOggetto(soggetto: string): string {
  let s = soggetto.trim();
  // Rimuovi prefissi PEC
  s = s.replace(/^(POSTA CERTIFICATA|ANOMALIA MESSAGGIO)\s*:\s*/i, "");
  // Rimuovi FWD/Re residui
  s = s.replace(/^(fwd?|re)\s*:\s*/i, "");
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

function estraiCorpoPrincipale(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    const text = Buffer.from(payload.body.data, "base64url").toString("utf-8");
    return payload.mimeType === "text/html" ? stripHtml(text) : text;
  }
  for (const part of payload.parts ?? []) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
  }
  for (const part of payload.parts ?? []) {
    const sub = estraiCorpoPrincipale(part);
    if (sub) return sub;
  }
  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  fotoData: { buffer: Buffer; filename: string; contentType: string }[];
};
