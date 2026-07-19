import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  titolo: z.string().min(1).max(200),
  personaId: z.number().int().optional(),
  progettoId: z.string().optional(),
  trascrizioneGrezza: z.string().optional(),
  dataOra: z.string().datetime().optional(),
  priorita: z.enum(["BASSA", "MEDIA", "ALTA"]).optional(),
});

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const personaId = searchParams.get("personaId");
  const progettoId = searchParams.get("progettoId");
  const stato = searchParams.get("stato");
  const priorita = searchParams.get("priorita");

  const riunioni = await prisma.riunione.findMany({
    where: {
      ...(personaId ? { personaId: Number(personaId) } : {}),
      ...(progettoId ? { progettoId } : {}),
      ...(stato ? { stato: stato as never } : {}),
      ...(priorita ? { priorita: priorita as never } : {}),
    },
    include: {
      persona: true,
      progetto: true,
      argomenti: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json(riunioni);
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { dataOra, ...rest } = parsed.data;

  const riunione = await prisma.riunione.create({
    data: {
      ...rest,
      ...(dataOra ? { dataOra: new Date(dataOra) } : {}),
    },
    include: { persona: true, progetto: true },
  });

  return NextResponse.json(riunione, { status: 201 });
}
