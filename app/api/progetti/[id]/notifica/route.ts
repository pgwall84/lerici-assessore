import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { DELEGHE_LABEL, STATO_PROGETTO_LABEL } from "@/lib/constants";
import { contentTypeDaNomeFile } from "@/lib/estrazione-documenti";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const { canale, destinatario } = await req.json();

  const progetto = await prisma.progetto.findUnique({
    where: { id },
    include: {
      responsabile: true,
      note: { orderBy: { createdAt: "desc" }, take: 1 },
      documenti: true,
    },
  });

  if (!progetto) return NextResponse.json({ error: "Non trovato" }, { status: 404 });

  const messaggio = formatMessaggio(progetto);

  if (canale === "testo") {
    return NextResponse.json({ testo: messaggio });
  }

  if (canale === "telegram") {
    await inviaTelegram(messaggio);
    return NextResponse.json({ ok: true });
  }

  if (canale === "email") {
    const dest = destinatario ?? progetto.responsabile?.email;
    if (!dest) return NextResponse.json({ error: "Nessun destinatario" }, { status: 400 });
    await inviaEmail(progetto, messaggio, dest);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Canale non supportato" }, { status: 400 });
}

function formatMessaggio(progetto: {
  id: string;
  delega: string;
  titolo: string;
  descrizione: string | null;
  stato: string;
  protocollo: string | null;
  createdAt: Date;
  responsabile: { nome: string; cognome: string; ruolo: string | null; telefono: string | null; email: string | null } | null;
  note: { testo: string; createdAt: Date }[];
}): string {
  const righe = [
    `📁 ${progetto.titolo}`,
    ``,
    `🏷 ${DELEGHE_LABEL[progetto.delega as keyof typeof DELEGHE_LABEL]}`,
    `📊 Stato: ${STATO_PROGETTO_LABEL[progetto.stato as keyof typeof STATO_PROGETTO_LABEL]}`,
  ];

  if (progetto.descrizione) righe.push(``, progetto.descrizione);
  if (progetto.protocollo) righe.push(`📎 Prot. ${progetto.protocollo}`);

  if (progetto.responsabile) {
    righe.push(``, `📌 Responsabile: ${progetto.responsabile.nome} ${progetto.responsabile.cognome}`);
    if (progetto.responsabile.ruolo) righe.push(`   ${progetto.responsabile.ruolo}`);
    if (progetto.responsabile.telefono) righe.push(`   📞 ${progetto.responsabile.telefono}`);
    if (progetto.responsabile.email) righe.push(`   ✉️ ${progetto.responsabile.email}`);
  }

  if (progetto.note.length > 0) {
    righe.push(``, `📝 Ultimo aggiornamento:`, progetto.note[0].testo);
  }

  righe.push(``, `🗓 Creato il ${new Date(progetto.createdAt).toLocaleDateString("it-IT")}`);
  righe.push(`🔗 Progetto #${progetto.id}`);

  return righe.join("\n");
}

async function inviaEmail(
  progetto: { id: string; titolo: string; documenti: { nomeFile: string; storageUrl: string }[] },
  testo: string,
  destinatario: string
) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  // A differenza delle foto di una Pratica (sempre immagini), i documenti di un Progetto possono
  // essere di qualunque tipo (PDF, immagini, ecc.) — content-type dedotto dal nome file, non
  // assunto "image/jpeg" a prescindere.
  const allegati = await Promise.all(
    progetto.documenti.map(async d => {
      const res = await fetch(d.storageUrl);
      const buf = Buffer.from(await res.arrayBuffer());
      return { filename: d.nomeFile, content: buf, contentType: contentTypeDaNomeFile(d.nomeFile) };
    })
  );

  const html = `<pre style="font-family:sans-serif;white-space:pre-wrap">${testo}</pre>`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: destinatario,
    subject: `[Assessore Lerici] ${progetto.titolo}`,
    text: testo,
    html,
    attachments: allegati,
  });
}

// Solo testo: a differenza delle foto di una Pratica, i documenti di un Progetto non sono
// garantiti essere immagini (spesso PDF) — l'API Telegram sendPhoto/sendMediaGroup li rifiuterebbe.
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
