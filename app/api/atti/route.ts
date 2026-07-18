import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  tipo: z.enum(["CONVOCAZIONE_GIUNTA", "CONVOCAZIONE_CONSIGLIO", "CONVOCAZIONE_COMMISSIONE", "MOZIONE", "INTERROGAZIONE"]),
  oggetto: z.string().min(1).max(200),
  dataSeduta: z.string().datetime().optional(),
  scadenzaRisposta: z.string().datetime().optional(),
  consiglioCollegatoId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const stato = searchParams.get("stato");
  const visualizzato = searchParams.get("visualizzato");

  const atti = await prisma.attoPoliticoAmministrativo.findMany({
    where: {
      ...(tipo ? { tipo: tipo as never } : {}),
      ...(stato ? { stato: stato as never } : {}),
      ...(visualizzato !== null ? { visualizzato: visualizzato === "true" } : {}),
    },
    include: { documenti: true, consiglioCollegato: true },
    orderBy: [{ dataSeduta: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(atti);
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { dataSeduta, scadenzaRisposta, ...rest } = parsed.data;

  const atto = await prisma.attoPoliticoAmministrativo.create({
    data: {
      ...rest,
      ...(dataSeduta ? { dataSeduta: new Date(dataSeduta) } : {}),
      ...(scadenzaRisposta ? { scadenzaRisposta: new Date(scadenzaRisposta) } : {}),
    },
  });

  return NextResponse.json(atto, { status: 201 });
}
