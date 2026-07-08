import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ testo: z.string().min(1) });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await params;
  const note = await prisma.nota.findMany({
    where: { praticaId: Number(id) },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(note);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const nota = await prisma.nota.create({
    data: { praticaId: Number(id), testo: parsed.data.testo },
  });

  await prisma.pratica.update({ where: { id: Number(id) }, data: { updatedAt: new Date() } });

  return NextResponse.json(nota, { status: 201 });
}
