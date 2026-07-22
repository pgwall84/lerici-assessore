import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  titolo: z.string().min(1).max(200).optional(),
  delega: z.enum([
    "VIABILITA","AMBIENTE","RIFIUTI","SISTEMA_IDRICO","ILLUMINAZIONE",
    "ACCESSIBILITA","CIMITERI","POLITICHE_ABITATIVE","DIGITALIZZAZIONE","MANUTENZIONE_PATRIMONIO",
  ]).optional(),
  stato: z.enum(["IN_CORSO", "SOSPESO", "CONCLUSO", "ARCHIVIATO"]).optional(),
  priorita: z.enum(["BASSA", "MEDIA", "ALTA"]).nullable().optional(),
  descrizione: z.string().nullable().optional(),
  responsabileId: z.number().int().nullable().optional(),
  fonteFinanziamento: z.string().nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const progetto = await prisma.progetto.findUnique({
    where: { id },
    include: {
      responsabile: true,
      note: { orderBy: { createdAt: "asc" } },
      documenti: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!progetto) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  return NextResponse.json(progetto);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.progetto.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Non trovato" }, { status: 404 });

  const progetto = await prisma.progetto.update({
    where: { id },
    data: parsed.data,
    include: { responsabile: true },
  });

  return NextResponse.json(progetto);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.progetto.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Non trovato" }, { status: 404 });

  await prisma.progetto.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
