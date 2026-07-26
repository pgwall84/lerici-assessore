import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { TIPO_ATTO_LABEL, STATO_ATTO_LABEL } from "@/lib/constants";
import { contentTypeDaNomeFile } from "@/lib/estrazione-documenti";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const { canale, destinatario } = await req.json();

  const atto = await prisma.attoPoliticoAmministrativo.findUnique({
    where: { id },
    include: {
      responsabile: true,
      note: { orderBy: { createdAt: "desc" }, take: 1 },
      documenti: true,
    },
  });

  if (!atto) return NextResponse.json({ error: "Non trovato" }, { status: 404 });

  const messaggio = formatMessaggio(atto);

  if (canale === "testo") {
    return NextResponse.json({ testo: messaggio });
  }

  if (canale === "telegram") {
    await inviaTelegram(messaggio);
    return NextResponse.json({ ok: true });
  }

  if (canale === "email") {
    const dest = destinatario ?? atto.responsabile?.email;
    if (!dest) return NextResponse.json({ error: "Nessun destinatario" }, { status: 400 });
    await inviaEmail(atto, messaggio, dest);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Canale non supportato" }, { status: 400 });
}

function formatMessaggio(atto: {
  id: string;
  tipo: string;
  oggetto: string;
  stato: string;
  dataSeduta: Date | null;
  createdAt: Date;
  responsabile: { nome: string; cognome: string; ruolo: string | null; telefono: string | null; email: string | null } | null;
  note: { testo: string; createdAt: Date }[];
}): string {
  const righe = [
    `🏛️ ${atto.oggetto}`,
    ``,
    `🏷 ${TIPO_ATTO_LABEL[atto.tipo as keyof typeof TIPO_ATTO_LABEL]}`,
    `📊 Stato: ${STATO_ATTO_LABEL[atto.stato as keyof typeof STATO_ATTO_LABEL]}`,
  ];

  if (atto.dataSeduta) righe.push(`📅 Seduta il ${new Date(atto.dataSeduta).toLocaleDateString("it-IT")}`);

  if (atto.responsabile) {
    righe.push(``, `📌 Responsabile: ${atto.responsabile.nome} ${atto.responsabile.cognome}`);
    if (atto.responsabile.ruolo) righe.push(`   ${atto.responsabile.ruolo}`);
    if (atto.responsabile.telefono) righe.push(`   📞 ${atto.responsabile.telefono}`);
    if (atto.responsabile.email) righe.push(`   ✉️ ${atto.responsabile.email}`);
  }

  if (atto.note.length > 0) {
    righe.push(``, `📝 Ultimo aggiornamento:`, atto.note[0].testo);
  }

  righe.push(``, `🗓 Creato il ${new Date(atto.createdAt).toLocaleDateString("it-IT")}`);
  righe.push(`🔗 Atto #${atto.id}`);

  return righe.join("\n");
}

async function inviaEmail(
  atto: { id: string; oggetto: string; documenti: { nomeFile: string; storageUrl: string }[] },
  testo: string,
  destinatario: string
) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  // Come i documenti di un Progetto, quelli di un Atto possono essere di qualunque tipo
  // (PDF, immagini) — content-type dedotto dal nome file, non assunto a prescindere.
  const allegati = await Promise.all(
    atto.documenti.map(async d => {
      const res = await fetch(d.storageUrl);
      const buf = Buffer.from(await res.arrayBuffer());
      return { filename: d.nomeFile, content: buf, contentType: contentTypeDaNomeFile(d.nomeFile) };
    })
  );

  const html = `<pre style="font-family:sans-serif;white-space:pre-wrap">${testo}</pre>`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: destinatario,
    subject: `[Assessore Lerici] ${atto.oggetto}`,
    text: testo,
    html,
    attachments: allegati,
  });
}

// Solo testo: come per Progetto, i documenti di un Atto non sono garantiti essere immagini.
async function inviaTelegram(testo: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) throw new Error("Telegram non configurato");

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: testo }),
  });
  if (!res.ok) throw new Error(`Telegram error: ${JSON.stringify(await res.json())}`);
}
