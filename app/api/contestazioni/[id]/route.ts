import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  gestore: z.enum(["ACAM_AMBIENTE", "ACAM_ACQUE", "ATC"]).optional(),
  oggetto: z.string().min(1).max(200).optional(),
  descrizione: z.string().nullable().optional(),
  dataInvio: z.string().datetime().nullable().optional(),
  esito: z.enum(["IN_ATTESA", "RISOLTO", "RESPINTO", "SENZA_RISPOSTA"]).optional(),
  noteEsito: z.string().nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const contestazione = await prisma.contestazione.findUnique({
    where: { id },
    include: { documenti: { orderBy: { createdAt: "asc" } } },
  });

  if (!contestazione) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  return NextResponse.json(contestazione);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.contestazione.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  const { dataInvio, ...rest } = parsed.data;

  const contestazione = await prisma.contestazione.update({
    where: { id },
    data: {
      ...rest,
      ...(dataInvio !== undefined ? { dataInvio: dataInvio ? new Date(dataInvio) : null } : {}),
    },
    include: { documenti: { orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json(contestazione);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.contestazione.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  await prisma.contestazione.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
