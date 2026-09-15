import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

// Elenco Gestori (Fase 2 sezione 6.1: modello, non enum) — usato per popolare i selettori nelle
// pagine Contestazioni e nel form di conferma mail, invece della vecchia mappa statica.
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const gestori = await prisma.gestore.findMany({ orderBy: { nome: "asc" } });
  return NextResponse.json(gestori);
}
