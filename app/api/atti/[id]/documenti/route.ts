import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";
import { estraiTestoDaFile, estraiVociZip, trovaOdgInZip } from "@/lib/estrazione-documenti";
import { riformattaOdg } from "@/lib/claude";
import type { RuoloDocumento } from "@prisma/client";

const BUCKET = "foto";

async function caricaESalva(attoId: string, buffer: Buffer, nomeFile: string, ruolo: RuoloDocumento) {
  const ext = nomeFile.includes(".") ? nomeFile.split(".").pop() : "bin";
  const filename = `atto-${attoId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, { upsert: false });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return prisma.documentoAtto.create({ data: { attoId, nomeFile, storageUrl: publicUrl, ruolo } });
}

// Estrae il testo dal buffer e aggiorna odgTestoEstratto sull'atto; ritorna un avviso se qualcosa non va,
// senza mai bloccare il caricamento del documento.
async function provaEstraiOdg(attoId: string, buffer: Buffer, nomeFile: string): Promise<string | undefined> {
  try {
    const testoGrezzo = await estraiTestoDaFile(buffer, nomeFile);
    if (!testoGrezzo) return "Formato file non supportato per l'estrazione automatica (solo PDF e DOCX) — il documento resta comunque caricato.";
    const punti = await riformattaOdg(testoGrezzo);
    if (punti.length === 0) return "Testo estratto dal file ma la riformattazione non ha prodotto punti — riprova dalla scheda.";
    await prisma.attoPoliticoAmministrativo.update({
      where: { id: attoId },
      data: { odgTestoEstratto: punti.map(p => `- ${p}`).join("\n") },
    });
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : "Errore nell'estrazione automatica dell'ODG.";
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const ruolo = ((formData.get("ruolo") as string) || "PRATICA_ALLEGATA") as RuoloDocumento;
  if (!file) return NextResponse.json({ error: "Nessun file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  // Convocazione di Consiglio: lo zip contiene ODG + pratiche allegate. Si scompatta,
  // si individua l'ODG per euristica sul nome file (se univoca) e si carica tutto il resto
  // come pratica allegata, senza estrazione testo.
  if (file.name.toLowerCase().endsWith(".zip")) {
    let voci;
    try {
      voci = estraiVociZip(buffer);
    } catch {
      return NextResponse.json({ error: "Zip non valido o corrotto" }, { status: 400 });
    }
    if (voci.length === 0) return NextResponse.json({ error: "Zip vuoto" }, { status: 400 });

    const indiceOdg = trovaOdgInZip(voci);
    const documenti = await Promise.all(
      voci.map((v, i) => caricaESalva(id, v.buffer, v.nomeFile, i === indiceOdg ? "ORDINE_GIORNO" : "PRATICA_ALLEGATA"))
    );

    let odgAvviso: string | undefined;
    if (indiceOdg !== null) {
      odgAvviso = await provaEstraiOdg(id, voci[indiceOdg].buffer, voci[indiceOdg].nomeFile);
    } else {
      odgAvviso = `Nessun file dello zip corrisponde in modo univoco al pattern "ordine del giorno" — scegli tu quale file è l'ODG usando "Estrai come ODG" sul documento giusto qui sotto.`;
    }

    return NextResponse.json({ documenti, odgAvviso }, { status: 201 });
  }

  const documento = await caricaESalva(id, buffer, file.name, ruolo);

  let odgAvviso: string | undefined;
  if (ruolo === "ORDINE_GIORNO") {
    odgAvviso = await provaEstraiOdg(id, buffer, file.name);
  }

  return NextResponse.json({ documento, odgAvviso }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  await params;
  const { documentoId } = await req.json();

  const documento = await prisma.documentoAtto.findUnique({ where: { id: documentoId } });
  if (!documento) return NextResponse.json({ error: "Non trovato" }, { status: 404 });

  const filename = documento.storageUrl.split("/").pop();
  if (filename) await supabase.storage.from(BUCKET).remove([filename]);

  await prisma.documentoAtto.delete({ where: { id: documentoId } });
  return new NextResponse(null, { status: 204 });
}
