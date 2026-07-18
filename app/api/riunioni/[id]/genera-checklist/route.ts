import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { generaChecklist } from "@/lib/claude";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const riunione = await prisma.riunione.findUnique({ where: { id } });
  if (!riunione) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  if (!riunione.trascrizioneGrezza?.trim()) {
    return NextResponse.json({ error: "Nessuna trascrizione disponibile" }, { status: 400 });
  }

  let argomenti: string[];
  try {
    argomenti = await generaChecklist(riunione.trascrizioneGrezza);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore Claude API" }, { status: 500 });
  }

  // Rigenerazione: sostituisce gli argomenti esistenti non ancora confermati
  await prisma.argomentoRiunione.deleteMany({ where: { riunioneId: id } });
  await prisma.argomentoRiunione.createMany({
    data: argomenti.map((testo, i) => ({ riunioneId: id, testo, ordine: i })),
  });

  const aggiornata = await prisma.riunione.findUnique({
    where: { id },
    include: { argomenti: { orderBy: { ordine: "asc" } }, persona: true, progetto: true },
  });

  return NextResponse.json(aggiornata);
}
