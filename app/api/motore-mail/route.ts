import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

// Conteggi leggeri (solo DB, nessuna chiamata Gmail) per i badge — vedi Navbar.tsx.
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const [manuale, incerto, automatico] = await Promise.all([
    prisma.mailProcessata.count({ where: { esito: "IN_ATTESA", binario: "MANUALE" } }),
    prisma.mailProcessata.count({ where: { esito: "IN_ATTESA", binario: "INCERTO" } }),
    prisma.mailProcessata.count({ where: { esito: "IN_ATTESA", binario: "AUTOMATICO" } }),
  ]);

  return NextResponse.json({ manuale, incerto, automatico });
}
