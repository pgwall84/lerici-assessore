import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  testo: z.string().min(1).optional(),
  spuntato: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; argId: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id, argId } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.argomentoRiunione.findUnique({ where: { id: argId } });
  if (!existing || existing.riunioneId !== id) return NextResponse.json({ error: "Non trovato" }, { status: 404 });

  const { spuntato, ...rest } = parsed.data;

  const argomento = await prisma.argomentoRiunione.update({
    where: { id: argId },
    data: {
      ...rest,
      ...(spuntato !== undefined ? { spuntato, spuntatoAt: spuntato ? new Date() : null } : {}),
    },
  });

  return NextResponse.json(argomento);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; argId: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id, argId } = await params;
  const existing = await prisma.argomentoRiunione.findUnique({ where: { id: argId } });
  if (!existing || existing.riunioneId !== id) return NextResponse.json({ error: "Non trovato" }, { status: 404 });

  await prisma.argomentoRiunione.delete({ where: { id: argId } });
  return new NextResponse(null, { status: 204 });
}
