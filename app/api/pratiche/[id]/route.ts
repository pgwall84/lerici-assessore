import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  stato: z.enum(["APERTA","IN_CORSO","CHIUSA","SOSPESA","APPUNTO","IN_VALUTAZIONE","PROMOSSA","ARCHIVIATA"]).optional(),
  priorita: z.enum(["NORMALE","URGENTE"]).optional(),
  titolo: z.string().min(1).max(200).optional(),
  descrizione: z.string().optional(),
  luogo: z.string().optional(),
  personaId: z.number().int().nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const pratica = await prisma.pratica.findUnique({
    where: { id: Number(id) },
    include: {
      persona: true,
      segnalante: true,
      foto: true,
      note: { orderBy: { createdAt: "asc" } },
      storico: { orderBy: { createdAt: "asc" } },
      appuntamenti: { orderBy: { dataOra: "asc" } },
    },
  });

  if (!pratica) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  return NextResponse.json(pratica);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.pratica.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  const { stato, ...rest } = parsed.data;

  const pratica = await prisma.pratica.update({
    where: { id: Number(id) },
    data: {
      ...rest,
      ...(stato ? { stato } : {}),
      ...(stato === "CHIUSA" && existing.stato !== "CHIUSA" ? { chiusaAt: new Date() } : {}),
      ...(stato && stato !== existing.stato ? {
        storico: {
          create: { statoPrecedente: existing.stato, statoNuovo: stato },
        },
      } : {}),
    },
    include: { persona: true, segnalante: true },
  });

  return NextResponse.json(pratica);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  await prisma.pratica.delete({ where: { id: Number(id) } });
  return new NextResponse(null, { status: 204 });
}
