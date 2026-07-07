import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { google } from "googleapis";
import { simpleParser } from "mailparser";

function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return auth;
}

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const gmail = google.gmail({ version: "v1", auth: getAuth() });
  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  const labelSegnalazioni = labelsRes.data.labels?.find(l => l.name === "Segnalazioni");
  if (!labelSegnalazioni?.id) return NextResponse.json({ error: "Label non trovata" });

  const listRes = await gmail.users.messages.list({ userId: "me", labelIds: [labelSegnalazioni.id], maxResults: 1 });
  const msg = listRes.data.messages?.[0];
  if (!msg) return NextResponse.json({ error: "Nessuna mail" });

  const full = await gmail.users.messages.get({ userId: "me", id: msg.id!, format: "full" });

  // Trova postacert.eml
  function trovaParte(payload: any): any {
    if (!payload) return null;
    if ((payload.filename ?? "").toLowerCase().includes("postacert.eml")) return payload;
    for (const p of payload.parts ?? []) { const f = trovaParte(p); if (f) return f; }
    return null;
  }

  const part = trovaParte(full.data.payload);
  if (!part?.body?.attachmentId) return NextResponse.json({ error: "postacert.eml non trovato" });

  const att = await gmail.users.messages.attachments.get({ userId: "me", messageId: msg.id!, id: part.body.attachmentId });
  const emlBuffer = Buffer.from(att.data.data!, "base64url");

  const parsed = await simpleParser(emlBuffer);

  // Trova la riga con "Oggetto" nel testo raw
  const emlRaw = emlBuffer.toString("latin1");
  const oggettoLineRaw = emlRaw.split("\n").find(l => /oggetto/i.test(l)) ?? "";
  const oggettoLineHex = Buffer.from(oggettoLineRaw, "latin1").toString("hex").slice(0, 200);

  return NextResponse.json({
    parsed_text_first100: (parsed.text ?? "").slice(0, 300),
    parsed_html_has: !!parsed.html,
    oggetto_raw_line: oggettoLineRaw.slice(0, 200),
    oggetto_hex: oggettoLineHex,
    content_type_header: full.data.payload?.headers?.find(h => h.name === "Content-Type")?.value,
    attachments: parsed.attachments?.map(a => ({ filename: a.filename, contentType: a.contentType, size: a.size })),
  });
}
