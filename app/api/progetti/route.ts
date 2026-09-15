import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { risolviEnteVarioId } from "@/lib/enti-vari";
import { z } from "zod";

const schema = z.object({
  titolo: z.string().min(1).max(200),
  delega: z.enum([
    "VIABILITA","AMBIENTE","RIFIUTI","SISTEMA_IDRICO","ILLUMINAZIONE",
    "ACCESSIBILITA","CIMITERI","POLITICHE_ABITATIVE","DIGITALIZZAZIONE","MANUTENZIONE_PATRIMONIO",
  ]).optional(),
  // "Varie" (Fase 2 sezione 5: da enum a modello EnteVario) — enteVarioId sceglie un ente già
  // noto, nuovoEnteNome ne crea uno al volo se Marco digita un nome non ancora in lista.
  enteVarioId: z.string().min(1).optional(),
  nuovoEnteNome: z.string().min(1).max(100).optional(),
  descrizione: z.string().optional(),
  responsabileId: z.number().int().optional(),
  fonteFinanziamento: z.string().optional(),
  priorita: z.enum(["BASSA", "MEDIA", "ALTA"]).optional(),
});

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const stato = searchParams.get("stato");
  const delega = searchParams.get("delega");
  const priorita = searchParams.get("priorita");
  const q = searchParams.get("q");

  const progetti = await prisma.progetto.findMany({
    where: {
      ...(stato ? { stato: stato as never } : {}),
      ...(delega ? { delega: delega as never } : {}),
      ...(priorita ? { priorita: priorita as never } : {}),
      ...(q ? { OR: [
        { titolo: { contains: q, mode: "insensitive" } },
        { descrizione: { contains: q, mode: "insensitive" } },
      ]} : {}),
    },
    include: {
      responsabile: true,
      enteVario: true,
      note: { orderBy: { createdAt: "desc" }, take: 1 },
      documenti: true,
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return NextResponse.json(progetti);
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { enteVarioId, nuovoEnteNome, ...rest } = parsed.data;
  const enteVarioIdRisolto = await risolviEnteVarioId({ enteVarioId, nuovoEnteNome });
  if (!rest.delega && !enteVarioIdRisolto) {
    return NextResponse.json({ error: "Delega o ente obbligatorio" }, { status: 400 });
  }

  const progetto = await prisma.progetto.create({
    data: { ...rest, enteVarioId: enteVarioIdRisolto },
    include: { responsabile: true, enteVario: true },
  });

  return NextResponse.json(progetto, { status: 201 });
}
