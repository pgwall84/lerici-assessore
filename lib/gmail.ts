import { google } from "googleapis";

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

  // Trova label "Segnalazioni"
  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  const labelSegnalazioni = labelsRes.data.labels?.find(l => l.name === "Segnalazioni");
  if (!labelSegnalazioni?.id) return [];

  // Label "Importata" per escludere già importate
  const labelImportata = labelsRes.data.labels?.find(l => l.name === "Importata");

  // Lista messaggi con label Segnalazioni
  const listRes = await gmail.users.messages.list({
    userId: "me",
    labelIds: [labelSegnalazioni.id],
    maxResults: 20,
  });

  const messages = listRes.data.messages ?? [];
  const risultati: MailImport[] = [];

  for (const msg of messages) {
    const full = await gmail.users.messages.get({ userId: "me", id: msg.id! });
    const data = full.data;

    // Salta già importate
    if (labelImportata?.id && data.labelIds?.includes(labelImportata.id)) continue;

    const headers = data.payload?.headers ?? [];
    const oggetto = headers.find(h => h.name === "Subject")?.value ?? "";
    const mittente = headers.find(h => h.name === "From")?.value ?? "";
    const data_mail = headers.find(h => h.name === "Date")?.value ?? "";

    // Estrai body testo
    const corpo = estraiCorpo(data.payload);

    risultati.push({
      messageId: msg.id!,
      oggetto,
      mittente,
      data: data_mail,
      corpo: corpo.slice(0, 2000),
    });
  }

  return risultati;
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

function estraiCorpo(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
    for (const part of payload.parts) {
      const sub = estraiCorpo(part);
      if (sub) return sub;
    }
  }
  return "";
}

export type MailImport = {
  messageId: string;
  oggetto: string;
  mittente: string;
  data: string;
  corpo: string;
};
