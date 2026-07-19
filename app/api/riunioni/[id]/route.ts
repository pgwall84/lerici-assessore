import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  titolo: z.string().min(1).max(200).optional(),
  stato: z.enum(["IN_PREPARAZIONE", "PRONTA", "IN_CORSO", "CONCLUSA"]).optional(),
  dataOra: z.string().datetime().nullable().optional(),
  trascrizioneGrezza: z.string().optional(),
  priorita: z.enum(["BASSA", "MEDIA", "ALTA"]).nullable().optional(),
  personaId: z.number().int().nullable().optional(),
  progettoId: z.string().nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const riunione = await prisma.riunione.findUnique({
    where: { id },
    include: {
      persona: true,
      progetto: true,
      argomenti: { orderBy: { ordine: "asc" } },
    },
  });

  if (!riunione) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  return NextResponse.json(riunione);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.riunione.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  const { dataOra, ...rest } = parsed.data;

  const riunione = await prisma.riunione.update({
    where: { id },
    data: {
      ...rest,
      ...(dataOra !== undefined ? { dataOra: dataOra ? new Date(dataOra) : null } : {}),
    },
    include: {
      persona: true,
      progetto: true,
      argomenti: { orderBy: { ordine: "asc" } },
    },
  });

  return NextResponse.json(riunione);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.riunione.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  await prisma.riunione.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
