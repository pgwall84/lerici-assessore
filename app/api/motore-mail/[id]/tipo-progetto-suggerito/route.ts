import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getMailPerId } from "@/lib/gmail";
import { classificaTipoProgetto } from "@/lib/claude";

// Suggerimento Progetto/Attività (redesign 2026-07-24), caricato solo su richiesta (non per
// tutte le righe della coda) — è l'unica chiamata AI di questo redesign che costa una vera
// richiesta a Claude, quindi va invocata solo quando la riga "progetto" viene effettivamente
// aperta in UI, mai eagerly per tutta la pagina.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const riga = await prisma.mailProcessata.findUnique({ where: { id } });
  if (!riga) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  const mail = await getMailPerId(riga.messageId);
  if (!mail) return NextResponse.json({ error: "Mail non trovata su Gmail" }, { status: 404 });

  let tipo: "PROGETTO" | "ATTIVITA" | null = null;
  try {
    tipo = await classificaTipoProgetto(mail.titolo, mail.descrizione);
  } catch {
    // ignorato di proposito — nessun suggerimento, resta a scelta manuale
  }
  return NextResponse.json({ tipo });
}
