import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getMailPerId } from "@/lib/gmail";
import { classificaDelega, classificaSottoTema } from "@/lib/classificatore";
import { classificaZona } from "@/lib/claude";

// Suggerimenti per una riga che Marco sceglie di classificare come Segnalazione dal selettore
// (2026-09-21): la lista di revisione calcola zona/sotto-tema solo per le righe già proposte come
// segnalazione all'origine, quindi una riga Incerto/Manuale ricategorizzata a mano restava con
// luogo e sotto-tema vuoti. Caricato solo su richiesta (una chiamata Claude per la zona), stesso
// principio di tipo-progetto-suggerito — mai per tutta la pagina.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const riga = await prisma.mailProcessata.findUnique({ where: { id } });
  if (!riga) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  const mail = await getMailPerId(riga.messageId);
  if (!mail) return NextResponse.json({ error: "Mail non trovata su Gmail" }, { status: 404 });

  const testo = `${mail.titolo} ${mail.descrizione}`;
  const delega = classificaDelega(testo);
  const sottoTema = classificaSottoTema(delega, testo);
  const zona = await classificaZona(testo).catch(() => null);
  return NextResponse.json({ zona, delega, sottoTema });
}
