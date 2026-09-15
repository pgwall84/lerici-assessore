import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

// Elenco EnteVario (Fase 2 sezione 5: modello, non enum) — usato per popolare i selettori "Varie"
// nelle pagine Progetti e nel form di conferma mail, invece della vecchia mappa statica.
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const enti = await prisma.enteVario.findMany({ orderBy: { nome: "asc" } });
  return NextResponse.json(enti);
}
