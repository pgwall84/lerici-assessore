import { google } from "googleapis";
import { simpleParser } from "mailparser";
import { supabase } from "@/lib/supabase";
import { ETICHETTA_INCERTO, ETICHETTA_NON_RILEVANTE } from "@/lib/constants";
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
  return getMailsPerEtichetta("Segnalazioni");
}

// Fetch + parsing di un singolo messaggio (headers, eventuale postacert.eml, allegati).
// Isolata perché riusata sia dal listing completo sia da quello paginato sia dal recupero
// per id singolo (POST), senza dover mai rielencare un'intera etichetta.
async function parseMessaggioPerId(
  gmail: ReturnType<typeof google.gmail>,
  messageId: string,
  labelImportataId?: string,
): Promise<MailImport | null> {
  const full = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const data = full.data;

  if (labelImportataId && data.labelIds?.includes(labelImportataId)) return null;

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
      messageId,
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

  return {
    messageId,
    threadId: data.threadId ?? "",
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
    labelIds: data.labelIds ?? [],
  };
}

/** Recupera e parsa un singolo messaggio per id, senza dover rielencare l'etichetta di provenienza. */
export async function getMailPerId(messageId: string): Promise<MailImport | null> {
  const gmail = google.gmail({ version: "v1", auth: getAuth() });
  return parseMessaggioPerId(gmail, messageId);
}

/** Una pagina di mail da un'etichetta, in parallelo. Per liste grandi, molto più veloce del fetch completo. */
export async function getMailsPerEtichettaPaginato(
  nomeEtichetta: string,
  pageToken?: string,
  maxResults = 10,
): Promise<{ mails: MailImport[]; nextPageToken?: string }> {
  const gmail = google.gmail({ version: "v1", auth: getAuth() });

  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  const labelTarget = labelsRes.data.labels?.find(l => l.name === nomeEtichetta);
  if (!labelTarget?.id) return { mails: [] };
  const labelImportata = labelsRes.data.labels?.find(l => l.name === "Importata");

  const listRes = await gmail.users.messages.list({
    userId: "me",
    labelIds: [labelTarget.id],
    q: "-label:Importata",
    maxResults,
    pageToken,
  });

  const messages = listRes.data.messages ?? [];
  const parsed = await Promise.all(messages.map(m => parseMessaggioPerId(gmail, m.id!, labelImportata?.id ?? undefined)));

  return {
    mails: parsed.filter((m): m is MailImport => m !== null),
    nextPageToken: listRes.data.nextPageToken ?? undefined,
  };
}

/**
 * Una pagina di mail da TUTTA la casella (non per etichetta) — per il motore di scansione
 * (sezione 6): la classificazione ora copre tutta la posta in arrivo, non solo le etichette
 * già mappate, così "Incerto" può intercettare anche mail senza nessuna etichetta nota.
 * Esclude lato query inviate/bozze/cestino/spam (non hanno bisogno di classificazione) e,
 * come ottimizzazione di volume, le già "Importata": il pregresso già gestito dal vecchio
 * flusso non ha bisogno di una riga MailProcessata retroattiva — la deduplica vera resta
 * comunque il controllo su MailProcessata lato chiamante, non questo filtro.
 */
export async function getMailsPaginato(
  pageToken?: string,
  maxResults = 25,
): Promise<{ mails: MailImport[]; nextPageToken?: string }> {
  const gmail = google.gmail({ version: "v1", auth: getAuth() });

  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  const labelImportata = labelsRes.data.labels?.find(l => l.name === "Importata");

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: "-in:sent -in:draft -in:trash -in:spam -label:Importata",
    maxResults,
    pageToken,
  });

  const messages = listRes.data.messages ?? [];
  const parsed = await Promise.all(messages.map(m => parseMessaggioPerId(gmail, m.id!, labelImportata?.id ?? undefined)));

  return {
    mails: parsed.filter((m): m is MailImport => m !== null),
    nextPageToken: listRes.data.nextPageToken ?? undefined,
  };
}

/** Mappa labelId -> nome etichetta, per tradurre MailImport.labelIds in nomi da confrontare con la tassonomia. */
export async function getMappaEtichette(): Promise<Map<string, string>> {
  const gmail = google.gmail({ version: "v1", auth: getAuth() });
  const res = await gmail.users.labels.list({ userId: "me" });
  return new Map((res.data.labels ?? []).map(l => [l.id!, l.name!]));
}

export async function getMailsPerEtichetta(nomeEtichetta: string): Promise<MailImport[]> {
  const gmail = google.gmail({ version: "v1", auth: getAuth() });

  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  const labelTarget = labelsRes.data.labels?.find(l => l.name === nomeEtichetta);
  if (!labelTarget?.id) return [];
  const labelImportata = labelsRes.data.labels?.find(l => l.name === "Importata");

  // Esclude lato Gmail le mail gia importate, altrimenti occupano posti nella
  // finestra di maxResults e le piu vecchie non ancora importate non vengono mai recuperate.
  const listRes = await gmail.users.messages.list({
    userId: "me",
    labelIds: [labelTarget.id],
    q: "-label:Importata",
    maxResults: 50,
  });

  const messages = listRes.data.messages ?? [];
  const parsed = await Promise.all(messages.map(m => parseMessaggioPerId(gmail, m.id!, labelImportata?.id ?? undefined)));
  return parsed.filter((m): m is MailImport => m !== null);
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

/** Applica un'etichetta qualunque (get-or-create), creandola se non esiste ancora. */
export async function applicaEtichetta(messageId: string, nomeEtichetta: string): Promise<void> {
  const gmail = google.gmail({ version: "v1", auth: getAuth() });
  const labelId = await getOrCreateLabel(nomeEtichetta);
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { addLabelIds: [labelId] },
  });
}

/** Rimuove la mail da INBOX e toglie UNREAD se presente — resta visibile solo tramite l'etichetta
 * di categoria già applicata. Va chiamata solo DOPO che quell'etichetta è stata applicata con
 * successo (vedi applicaEtichettaEArchivia): mai prima, altrimenti una mail archiviata senza una
 * categoria applicata diventerebbe difficile da ritrovare. */
export async function archiviaMail(messageId: string): Promise<void> {
  const gmail = google.gmail({ version: "v1", auth: getAuth() });
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { removeLabelIds: ["INBOX", "UNREAD"] },
  });
}

/** Applica l'etichetta di categoria e, solo se riesce, archivia la mail — se l'etichetta fallisce
 * l'archiviazione non viene nemmeno tentata, la mail resta in INBOX. Sostituisce l'uso diretto di
 * applicaEtichetta() in tutti i punti che completano una riga MailProcessata con successo. */
export async function applicaEtichettaEArchivia(messageId: string, nomeEtichetta: string): Promise<void> {
  await applicaEtichetta(messageId, nomeEtichetta);
  await archiviaMail(messageId);
}

/** Sposta la mail nel Cestino di Gmail — reversibile per 30 giorni (non cancellazione immediata). */
export async function spostaNelCestino(messageId: string): Promise<void> {
  const gmail = google.gmail({ version: "v1", auth: getAuth() });
  await gmail.users.messages.trash({ userId: "me", id: messageId });
}

/** Rimuove un'etichetta qualunque, se esiste. Nessun errore se l'etichetta non è mai esistita. */
export async function rimuoviEtichetta(messageId: string, nomeEtichetta: string): Promise<void> {
  const gmail = google.gmail({ version: "v1", auth: getAuth() });
  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  const label = labelsRes.data.labels?.find(l => l.name === nomeEtichetta);
  if (!label?.id) return;
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { removeLabelIds: [label.id] },
  });
}

export async function marcaImportata(messageId: string): Promise<void> {
  return applicaEtichetta(messageId, "Importata");
}

/** Etichetta puramente informativa sullo stato di classificazione — a differenza di "Importata"
 * (che segue sempre un'entità creata), questa si applica appena il motore determina binario: INCERTO,
 * non essendoci nessuna entità la cui creazione debba prima andare a buon fine. */
export async function marcaIncerto(messageId: string): Promise<void> {
  return applicaEtichetta(messageId, ETICHETTA_INCERTO);
}

/** Come marcaIncerto: nessuna entità creata, solo un'etichetta informativa — la mail è stata
 * riconosciuta come fuori scope per il tool (binario NON_RILEVANTE), non come ambigua. */
export async function marcaNonRilevante(messageId: string): Promise<void> {
  return applicaEtichetta(messageId, ETICHETTA_NON_RILEVANTE);
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
  threadId: string;
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
  labelIds: string[];
};
