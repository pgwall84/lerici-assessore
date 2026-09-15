import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import type { Delega } from "@prisma/client";

// Elenco SottoTema (Fase 2, 2026-09-15: livello facoltativo sotto una Delega) — filtrabile per
// delega via querystring, stesso pattern di /api/gestori e /api/enti-vari.
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const delega = req.nextUrl.searchParams.get("delega") as Delega | null;
  const sottoTemi = await prisma.sottoTema.findMany({
    where: delega ? { delega } : undefined,
    orderBy: { nome: "asc" },
  });
  return NextResponse.json(sottoTemi);
}
