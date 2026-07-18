import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  ufficioMittente: z.string().nullable().optional(),
  oggetto: z.string().min(1).max(200).optional(),
  dataRicezione: z.string().datetime().optional(),
  inoltrata: z.boolean().optional(),
  visualizzata: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const giustifica = await prisma.giustifica.findUnique({
    where: { id },
    include: { documenti: { orderBy: { createdAt: "asc" } } },
  });

  if (!giustifica) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  return NextResponse.json(giustifica);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.giustifica.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  const { dataRicezione, inoltrata, visualizzata, ...rest } = parsed.data;

  const giustifica = await prisma.giustifica.update({
    where: { id },
    data: {
      ...rest,
      ...(dataRicezione ? { dataRicezione: new Date(dataRicezione) } : {}),
      ...(inoltrata !== undefined ? { inoltrata, inoltrataAt: inoltrata ? new Date() : null } : {}),
      ...(visualizzata !== undefined ? { visualizzata, visualizzataAt: visualizzata ? new Date() : null } : {}),
    },
    include: { documenti: { orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json(giustifica);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.giustifica.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  await prisma.giustifica.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
