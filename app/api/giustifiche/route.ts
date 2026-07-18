import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  ufficioMittente: z.string().optional(),
  oggetto: z.string().min(1).max(200),
  dataRicezione: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const visualizzata = searchParams.get("visualizzata");
  const inoltrata = searchParams.get("inoltrata");

  const giustifiche = await prisma.giustifica.findMany({
    where: {
      ...(visualizzata !== null ? { visualizzata: visualizzata === "true" } : {}),
      ...(inoltrata !== null ? { inoltrata: inoltrata === "true" } : {}),
    },
    include: { documenti: true },
    orderBy: [{ dataRicezione: "desc" }],
  });

  return NextResponse.json(giustifiche);
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { dataRicezione, ...rest } = parsed.data;

  const giustifica = await prisma.giustifica.create({
    data: {
      ...rest,
      ...(dataRicezione ? { dataRicezione: new Date(dataRicezione) } : {}),
    },
  });

  return NextResponse.json(giustifica, { status: 201 });
}
