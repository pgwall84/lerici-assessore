import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { estraiTestoDaFile } from "@/lib/estrazione-documenti";
import { riformattaOdg } from "@/lib/claude";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const { documentoId } = await req.json();

  const documento = await prisma.documentoAtto.findUnique({ where: { id: documentoId } });
  if (!documento || documento.attoId !== id) return NextResponse.json({ error: "Documento non trovato" }, { status: 404 });

  const res = await fetch(documento.storageUrl);
  if (!res.ok) return NextResponse.json({ error: "Impossibile scaricare il file da Storage" }, { status: 500 });
  const buffer = Buffer.from(await res.arrayBuffer());

  let testoGrezzo: string;
  try {
    testoGrezzo = await estraiTestoDaFile(buffer, documento.nomeFile);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore nella lettura del file" }, { status: 500 });
  }
  if (!testoGrezzo) {
    return NextResponse.json({ error: "Formato file non supportato per l'estrazione (solo PDF e DOCX)" }, { status: 400 });
  }

  let punti: string[];
  try {
    punti = await riformattaOdg(testoGrezzo);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore Claude API" }, { status: 500 });
  }

  if (punti.length === 0) {
    return NextResponse.json({ error: "Nessun punto estratto dal testo" }, { status: 422 });
  }

  // Chiamare "estrai" su un documento lo designa come l'ODG, anche se caricato come pratica allegata
  // (es. scelta manuale dopo uno zip ambiguo).
  await prisma.documentoAtto.update({ where: { id: documentoId }, data: { ruolo: "ORDINE_GIORNO" } });

  const atto = await prisma.attoPoliticoAmministrativo.update({
    where: { id },
    data: { odgTestoEstratto: punti.map(p => `- ${p}`).join("\n") },
    include: { documenti: { orderBy: { createdAt: "asc" } }, consiglioCollegato: true },
  });

  return NextResponse.json(atto);
}
