import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { STATO_INIZIALE } from "@/lib/constants";
import { z } from "zod";

const schema = z.object({
  tipo: z.enum(["SEGNALAZIONE", "MIA_IDEA"]),
  delega: z.enum([
    "VIABILITA","AMBIENTE","RIFIUTI","SISTEMA_IDRICO","ILLUMINAZIONE",
    "ACCESSIBILITA","CIMITERI","POLITICHE_ABITATIVE","DIGITALIZZAZIONE","MANUTENZIONE_PATRIMONIO",
  ]),
  titolo: z.string().min(1).max(200),
  descrizione: z.string().optional(),
  luogo: z.string().optional(),
  priorita: z.enum(["BASSA", "MEDIA", "ALTA"]).default("MEDIA"),
  personaId: z.number().int().optional(),
  segnalante: z.object({
    nome: z.string().optional(),
    telefono: z.string().optional(),
    email: z.string().email().optional(),
  }).optional(),
});

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo") as string | null;
  const delega = searchParams.get("delega") as string | null;
  const stato = searchParams.get("stato") as string | null;
  const q = searchParams.get("q");

  const vista = searchParams.get("vista"); // "operativa" | "archivio"
  const STATI_OPERATIVA = ["APERTA", "IN_CORSO", "IN_VALUTAZIONE", "PROMOSSA"];
  const STATI_ARCHIVIO = ["CHIUSA", "SOSPESA", "ARCHIVIATA"];

  const pratiche = await prisma.pratica.findMany({
    where: {
      ...(tipo ? { tipo: tipo as never } : { tipo: { not: "PROGETTO" as never } }),
      ...(delega ? { delega: delega as never } : {}),
      ...(stato ? { stato: stato as never } :
        vista === "operativa" ? { stato: { in: STATI_OPERATIVA as never[] } } :
        vista === "archivio" ? { stato: { in: STATI_ARCHIVIO as never[] } } :
        { stato: { not: "ARCHIVIATA" as never } }),
      ...(q ? { OR: [
        { titolo: { contains: q, mode: "insensitive" } },
        { descrizione: { contains: q, mode: "insensitive" } },
      ]} : {}),
    },
    include: {
      persona: true,
      segnalante: true,
      foto: true,
      note: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ priorita: "desc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json(pratiche);
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { tipo, segnalante, ...rest } = parsed.data;
  const statoIniziale = STATO_INIZIALE[tipo];

  const pratica = await prisma.pratica.create({
    data: {
      tipo,
      stato: statoIniziale,
      ...rest,
      ...(segnalante && tipo === "SEGNALAZIONE" ? {
        segnalante: { create: segnalante },
      } : {}),
    },
    include: { persona: true, segnalante: true },
  });

  return NextResponse.json(pratica, { status: 201 });
}
