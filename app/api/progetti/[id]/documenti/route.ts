import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";

const BUCKET = "foto";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Nessun file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const filename = `progetto-${id}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
    contentType,
    upsert: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filename);

  const documento = await prisma.documentoProgetto.create({
    data: { progettoId: id, nomeFile: file.name, storageUrl: publicUrl },
  });

  return NextResponse.json(documento, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  await params;
  const { documentoId } = await req.json();

  const documento = await prisma.documentoProgetto.findUnique({ where: { id: documentoId } });
  if (!documento) return NextResponse.json({ error: "Non trovato" }, { status: 404 });

  const filename = documento.storageUrl.split("/").pop();
  if (filename) await supabase.storage.from(BUCKET).remove([filename]);

  await prisma.documentoProgetto.delete({ where: { id: documentoId } });
  return new NextResponse(null, { status: 204 });
}
