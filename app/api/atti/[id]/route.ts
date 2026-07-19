import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  oggetto: z.string().min(1).max(200).optional(),
  dataSeduta: z.string().datetime().nullable().optional(),
  scadenzaRisposta: z.string().datetime().nullable().optional(),
  stato: z.enum(["DA_ESAMINARE", "ESAMINATO", "RISPOSTO", "ARCHIVIATO"]).optional(),
  odgTestoEstratto: z.string().nullable().optional(),
  consiglioCollegatoId: z.string().nullable().optional(),
  priorita: z.enum(["BASSA", "MEDIA", "ALTA"]).nullable().optional(),
  visualizzato: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const atto = await prisma.attoPoliticoAmministrativo.findUnique({
    where: { id },
    include: {
      documenti: { orderBy: { createdAt: "asc" } },
      consiglioCollegato: true,
      risposteCollegate: true,
    },
  });

  if (!atto) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  return NextResponse.json(atto);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.attoPoliticoAmministrativo.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Non trovato" }, { status: 404 });

  const { dataSeduta, scadenzaRisposta, visualizzato, ...rest } = parsed.data;

  const atto = await prisma.attoPoliticoAmministrativo.update({
    where: { id },
    data: {
      ...rest,
      ...(dataSeduta !== undefined ? { dataSeduta: dataSeduta ? new Date(dataSeduta) : null } : {}),
      ...(scadenzaRisposta !== undefined ? { scadenzaRisposta: scadenzaRisposta ? new Date(scadenzaRisposta) : null } : {}),
      ...(visualizzato !== undefined ? { visualizzato, visualizzatoAt: visualizzato ? new Date() : null } : {}),
    },
    include: { documenti: { orderBy: { createdAt: "asc" } }, consiglioCollegato: true },
  });

  return NextResponse.json(atto);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.attoPoliticoAmministrativo.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Non trovato" }, { status: 404 });

  await prisma.attoPoliticoAmministrativo.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
