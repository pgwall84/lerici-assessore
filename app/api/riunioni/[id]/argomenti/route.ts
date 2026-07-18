import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const addSchema = z.object({ testo: z.string().min(1) });
const reorderSchema = z.object({ ordine: z.array(z.string()) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const ultimo = await prisma.argomentoRiunione.findFirst({
    where: { riunioneId: id },
    orderBy: { ordine: "desc" },
  });

  const argomento = await prisma.argomentoRiunione.create({
    data: { riunioneId: id, testo: parsed.data.testo, ordine: (ultimo?.ordine ?? -1) + 1 },
  });

  return NextResponse.json(argomento, { status: 201 });
}

// Riordino: riceve l'elenco completo degli id nel nuovo ordine e riassegna "ordine" 0..n
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await prisma.$transaction(
    parsed.data.ordine.map((argomentoId, i) =>
      prisma.argomentoRiunione.update({
        where: { id: argomentoId, riunioneId: id },
        data: { ordine: i },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
