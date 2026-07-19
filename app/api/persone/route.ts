import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

const schema = z.object({
  nome: z.string().min(1),
  cognome: z.string().min(1),
  ruolo: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  emailSecondaria: z.string().email().optional().or(z.literal("")),
  azienda: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const persone = await prisma.persona.findMany({ orderBy: { cognome: "asc" } });
  return NextResponse.json(persone);
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, v === "" ? null : v])
  ) as unknown as Prisma.PersonaCreateInput;

  const persona = await prisma.persona.create({ data });
  return NextResponse.json(persona, { status: 201 });
}
