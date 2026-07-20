import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";

const DESTINATARIO = "marco.muro@credit-agricole.it";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const giustifica = await prisma.giustifica.findUnique({
    where: { id },
    include: { documenti: { orderBy: { createdAt: "asc" } } },
  });

  if (!giustifica) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  const allegati = await Promise.all(
    giustifica.documenti.map(async d => {
      const res = await fetch(d.storageUrl);
      const buf = Buffer.from(await res.arrayBuffer());
      return { filename: d.nomeFile, content: buf };
    })
  );

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: DESTINATARIO,
    subject: giustifica.oggetto,
    text: giustifica.ufficioMittente ? `Da: ${giustifica.ufficioMittente}` : "",
    attachments: allegati,
  });

  const aggiornata = await prisma.giustifica.update({
    where: { id },
    data: { inoltrata: true, inoltrataAt: new Date() },
    include: { documenti: { orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json(aggiornata);
}
