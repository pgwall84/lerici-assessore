import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";

const MAX_FOTO = 5;
const BUCKET = "foto";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const praticaId = Number(id);

  const conteggioAttuale = await prisma.foto.count({ where: { praticaId } });
  if (conteggioAttuale >= MAX_FOTO) {
    return NextResponse.json({ error: `Massimo ${MAX_FOTO} foto per pratica` }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("foto") as File | null;
  if (!file) return NextResponse.json({ error: "Nessun file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  let processed: Buffer;
  let contentType = "image/jpeg";
  try {
    processed = await sharp(buffer)
      .rotate()
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    // Se Sharp fallisce usa il file originale
    processed = buffer;
    contentType = file.type || "image/jpeg";
  }

  const ext = contentType.includes("png") ? "png" : "jpg";
  const filename = `pratica-${praticaId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(filename, processed, {
    contentType,
    upsert: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filename);

  const foto = await prisma.foto.create({
    data: { praticaId, path: publicUrl },
  });

  return NextResponse.json(foto, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const { fotoId } = await req.json();

  const foto = await prisma.foto.findUnique({ where: { id: fotoId } });
  if (!foto) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  // Estrai il filename dall'URL pubblico
  const filename = foto.path.split("/").pop();
  if (filename) await supabase.storage.from(BUCKET).remove([filename]);

  await prisma.foto.delete({ where: { id: fotoId } });
  return new NextResponse(null, { status: 204 });
}
