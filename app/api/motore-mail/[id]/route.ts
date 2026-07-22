import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { spostaNelCestino } from "@/lib/gmail";

// Elimina una riga di revisione IN_ATTESA: sposta la mail nel Cestino di Gmail (reversibile per
// 30 giorni, non cancellazione immediata) e rimuove la riga MailProcessata — l'utente ha scelto
// di scartarla, non c'è più nulla da tracciare. Gmail prima, DB dopo (l'inverso della regola
// "DB prima" usata per le creazioni): se il DB venisse cancellato prima e Gmail fallisse, la
// mail resterebbe in INBOX senza più nessuna riga che la tenga traccia — qui l'errore più sicuro
// da cui recuperare è "riprovare", non "aver perso il collegamento".
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const riga = await prisma.mailProcessata.findUnique({ where: { id } });
  if (!riga) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  if (riga.esito !== "IN_ATTESA") return NextResponse.json({ error: "Questa riga è già stata gestita" }, { status: 409 });

  try {
    await spostaNelCestino(riga.messageId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  await prisma.mailProcessata.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
