import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

// Ricerca libera per titolo/oggetto tra le entità esistenti (sezione 6, collegamento manuale):
// usata dalla revisione mail per agganciare a mano una riga Manuale/Incerto a una Pratica/Progetto/
// Contestazione già esistente, quando la catena di continuazione automatica non l'ha trovata da sola.
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const q = (searchParams.get("q") ?? "").trim();

  if (tipo !== "pratica" && tipo !== "progetto" && tipo !== "contestazione") {
    return NextResponse.json({ error: "tipo non valido" }, { status: 400 });
  }
  if (q.length < 2) return NextResponse.json({ risultati: [] });

  if (tipo === "pratica") {
    const righe = await prisma.pratica.findMany({
      where: { titolo: { contains: q, mode: "insensitive" } },
      select: { id: true, titolo: true, stato: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
    return NextResponse.json({ risultati: righe.map(r => ({ id: String(r.id), titolo: r.titolo, stato: r.stato })) });
  }

  if (tipo === "progetto") {
    const righe = await prisma.progetto.findMany({
      where: { titolo: { contains: q, mode: "insensitive" } },
      select: { id: true, titolo: true, stato: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
    return NextResponse.json({ risultati: righe.map(r => ({ id: r.id, titolo: r.titolo, stato: r.stato })) });
  }

  const righe = await prisma.contestazione.findMany({
    where: { oggetto: { contains: q, mode: "insensitive" } },
    select: { id: true, oggetto: true, esito: true },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  return NextResponse.json({ risultati: righe.map(r => ({ id: r.id, titolo: r.oggetto, stato: r.esito })) });
}
