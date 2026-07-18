import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";
import { estraiTestoDaFile } from "@/lib/estrazione-documenti";
import { riformattaOdg } from "@/lib/claude";

const BUCKET = "foto";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const ruolo = (formData.get("ruolo") as string) || "PRATICA_ALLEGATA";
  if (!file) return NextResponse.json({ error: "Nessun file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const filename = `atto-${id}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
    contentType,
    upsert: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filename);

  const documento = await prisma.documentoAtto.create({
    data: { attoId: id, nomeFile: file.name, storageUrl: publicUrl, ruolo: ruolo as never },
  });

  let odgAvviso: string | undefined;

  // Se è l'ordine del giorno, prova subito l'estrazione automatica del testo.
  // Errori (formato non supportato, chiave Claude mancante, ecc.) non bloccano l'upload:
  // il documento resta comunque caricato e scaricabile, l'estrazione si può riprovare a mano.
  if (ruolo === "ORDINE_GIORNO") {
    try {
      const testoGrezzo = await estraiTestoDaFile(buffer, file.name);
      if (testoGrezzo) {
        const punti = await riformattaOdg(testoGrezzo);
        if (punti.length > 0) {
          await prisma.attoPoliticoAmministrativo.update({
            where: { id },
            data: { odgTestoEstratto: punti.map(p => `- ${p}`).join("\n") },
          });
        } else {
          odgAvviso = "Testo estratto dal file ma la riformattazione non ha prodotto punti — riprova dalla scheda.";
        }
      } else {
        odgAvviso = "Formato file non supportato per l'estrazione automatica (solo PDF e DOCX) — il documento resta comunque caricato.";
      }
    } catch (e) {
      odgAvviso = e instanceof Error ? e.message : "Errore nell'estrazione automatica dell'ODG.";
    }
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
