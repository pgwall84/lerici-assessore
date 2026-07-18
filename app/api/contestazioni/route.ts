import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  gestore: z.enum(["ACAM_AMBIENTE", "ACAM_ACQUE", "ATC"]),
  oggetto: z.string().min(1).max(200),
  descrizione: z.string().optional(),
  dataInvio: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const gestore = searchParams.get("gestore");
  const esito = searchParams.get("esito");

  const contestazioni = await prisma.contestazione.findMany({
    where: {
      ...(gestore ? { gestore: gestore as never } : {}),
      ...(esito ? { esito: esito as never } : {}),
    },
    include: { documenti: true },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json(contestazioni);
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { dataInvio, ...rest } = parsed.data;

  const contestazione = await prisma.contestazione.create({
    data: {
      ...rest,
      ...(dataInvio ? { dataInvio: new Date(dataInvio) } : {}),
    },
  });

  return NextResponse.json(contestazione, { status: 201 });
}
