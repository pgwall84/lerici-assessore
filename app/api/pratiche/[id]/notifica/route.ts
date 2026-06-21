import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { DELEGHE_LABEL, STATO_LABEL, TIPO_LABEL } from "@/lib/constants";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const { canale, destinatario } = await req.json();

  const pratica = await prisma.pratica.findUnique({
    where: { id: Number(id) },
    include: {
      persona: true,
      segnalante: true,
      note: { orderBy: { createdAt: "desc" }, take: 1 },
      foto: true,
    },
  });

  if (!pratica) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  const messaggio = formatMessaggio(pratica);

  if (canale === "testo") {
    return NextResponse.json({ testo: messaggio.replace(/\*/g, "") });
  }

  if (canale === "telegram") {
    await inviaTelegram(messaggio, pratica.foto.map(f => f.path));
    return NextResponse.json({ ok: true });
  }

  if (canale === "email") {
    const dest = destinatario ?? pratica.persona?.email;
    if (!dest) return NextResponse.json({ error: "Nessun destinatario" }, { status: 400 });
    await inviaEmail(pratica, messaggio, dest);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Canale non supportato" }, { status: 400 });
}

function formatMessaggio(pratica: {
  id: number;
  tipo: string;
  delega: string;
  titolo: string;
  descrizione: string | null;
  luogo: string | null;
  stato: string;
  priorita: string;
  createdAt: Date;
  persona: { nome: string; cognome: string; ruolo: string | null; telefono: string | null; email: string | null } | null;
  segnalante: { nome: string | null; telefono: string | null } | null;
  note: { testo: string; createdAt: Date }[];
}): string {
  const righe = [
    `📋 *${pratica.titolo}*`,
    ``,
    `🏷 ${TIPO_LABEL[pratica.tipo as keyof typeof TIPO_LABEL]} · ${DELEGHE_LABEL[pratica.delega as keyof typeof DELEGHE_LABEL]}`,
    `📊 Stato: ${STATO_LABEL[pratica.stato as keyof typeof STATO_LABEL]}${pratica.priorita === "URGENTE" ? " 🔴" : ""}`,
  ];

  if (pratica.luogo) righe.push(`📍 ${pratica.luogo}`);
  if (pratica.descrizione) righe.push(``, pratica.descrizione);

  if (pratica.segnalante?.nome) {
    righe.push(``, `👤 Segnalante: ${pratica.segnalante.nome}${pratica.segnalante.telefono ? ` · ${pratica.segnalante.telefono}` : ""}`);
  }

  if (pratica.persona) {
    righe.push(``, `📌 Referente: ${pratica.persona.nome} ${pratica.persona.cognome}`);
    if (pratica.persona.ruolo) righe.push(`   ${pratica.persona.ruolo}`);
    if (pratica.persona.telefono) righe.push(`   📞 ${pratica.persona.telefono}`);
    if (pratica.persona.email) righe.push(`   ✉️ ${pratica.persona.email}`);
  }

  if (pratica.note.length > 0) {
    righe.push(``, `📝 Ultima nota:`, pratica.note[0].testo);
  }

  righe.push(``, `🗓 Creata il ${new Date(pratica.createdAt).toLocaleDateString("it-IT")}`);
  righe.push(`🔗 Pratica #${pratica.id}`);

  return righe.join("\n");
}

async function inviaEmail(
  pratica: { id: number; titolo: string; foto: { path: string }[] },
  testo: string,
  destinatario: string
) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const allegati = await Promise.all(
    pratica.foto.map(async (f, i) => {
      const res = await fetch(f.path);
      const buf = Buffer.from(await res.arrayBuffer());
      return { filename: `foto${i + 1}.jpg`, content: buf, contentType: "image/jpeg" };
    })
  );

  // Converti testo plain in HTML semplice
  const html = `<pre style="font-family:sans-serif;white-space:pre-wrap">${testo.replace(/\*/g, "")}</pre>`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: destinatario,
    subject: `[Assessore Lerici] ${pratica.titolo}`,
    text: testo.replace(/\*/g, ""),
    html,
    attachments: allegati,
  });
}

async function inviaTelegram(testo: string, fotoPaths: string[]) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) throw new Error("Telegram non configurato");

  const base = `https://api.telegram.org/bot${botToken}`;

  if (fotoPaths.length === 0) {
    // Solo testo
    const res = await fetch(`${base}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: testo, parse_mode: "Markdown" }),
    });
    if (!res.ok) throw new Error(`Telegram error: ${JSON.stringify(await res.json())}`);
    return;
  }

  if (fotoPaths.length === 1) {
    // Una sola foto con testo come didascalia — passa URL direttamente
    const res = await fetch(`${base}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, photo: fotoPaths[0], caption: testo, parse_mode: "Markdown" }),
    });
    if (!res.ok) throw new Error(`Telegram error: ${JSON.stringify(await res.json())}`);
    return;
  }

  // Più foto: prima il testo, poi album con URL
  const resText = await fetch(`${base}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: testo, parse_mode: "Markdown" }),
  });
  if (!resText.ok) throw new Error(`Telegram error: ${JSON.stringify(await resText.json())}`);

  const media = fotoPaths.map(url => ({ type: "photo", media: url }));
  const resMedia = await fetch(`${base}/sendMediaGroup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, media }),
  });
  if (!resMedia.ok) throw new Error(`Telegram error: ${JSON.stringify(await resMedia.json())}`);
}
