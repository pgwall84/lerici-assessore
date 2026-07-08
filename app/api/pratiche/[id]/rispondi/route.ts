import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";
import { z } from "zod";

const schema = z.object({
  to: z.string().email(),
  oggetto: z.string().min(1),
  corpo: z.string().min(1),
});

function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return auth;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const pratica = await prisma.pratica.findUnique({
    where: { id: Number(id) },
    select: { titolo: true, messageId: true },
  });
  if (!pratica) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  if (!pratica.messageId) return NextResponse.json({ error: "Pratica non importata da mail" }, { status: 400 });

  const gmail = google.gmail({ version: "v1", auth: getAuth() });

  // Recupera threadId e Message-ID header del messaggio originale
  const original = await gmail.users.messages.get({
    userId: "me",
    id: pratica.messageId,
    format: "metadata",
    metadataHeaders: ["Message-ID", "Subject"],
  });
  const threadId = original.data.threadId!;
  const originalMessageId = original.data.payload?.headers?.find(h => h.name === "Message-ID")?.value ?? "";

  // Costruisce raw RFC2822
  const from = `Marco Muro Assessore <${process.env.SMTP_USER}>`;
  const lines = [
    `From: ${from}`,
    `To: ${parsed.data.to}`,
    `Subject: ${parsed.data.oggetto}`,
    `In-Reply-To: ${originalMessageId}`,
    `References: ${originalMessageId}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(parsed.data.corpo, "utf-8").toString("base64"),
  ];
  const raw = Buffer.from(lines.join("\r\n")).toString("base64url");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId },
  });

  const mailInviata = await prisma.mailInviata.create({
    data: {
      praticaId: Number(id),
      to: parsed.data.to,
      oggetto: parsed.data.oggetto,
      corpo: parsed.data.corpo,
    },
  });

  return NextResponse.json({ ok: true, mailInviata });
}
