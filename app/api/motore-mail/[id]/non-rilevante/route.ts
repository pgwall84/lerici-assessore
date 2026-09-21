import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { marcaNonRilevante, archiviaMail, rimuoviEtichetta, getMailPerId } from "@/lib/gmail";
import { ETICHETTA_INCERTO, ETICHETTA_NON_RILEVANTE } from "@/lib/constants";

// Override manuale dell'utente: stesso trattamento del binario NON_RILEVANTE automatico (vedi
// classificaESalva in lib/motore-mail.ts) — etichetta dedicata + fuori INBOX, nessuna entità
// creata — per mail non ancora processate dall'AI o classificate diversamente da come le vede
// l'utente. DB prima (esito COMPLETATO), Gmail dopo: un fallimento su Gmail non deve far
// sembrare fallito lo smaltimento, la riga DB resta comunque la fonte di verità.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const riga = await prisma.mailProcessata.findUnique({ where: { id } });
  if (!riga) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  if (riga.esito !== "IN_ATTESA") return NextResponse.json({ error: "Questa riga è già stata gestita" }, { status: 409 });

  const emailMittente = (await getMailPerId(riga.messageId).catch(() => null))?.emailMittente.toLowerCase().trim();
  await prisma.mailProcessata.update({
    where: { id },
    // etichettaFinale: decisione presa da una persona, alimenta la memoria del mittente.
    data: { esito: "COMPLETATO", binario: "NON_RILEVANTE", entitaCreataId: null, etichettaFinale: ETICHETTA_NON_RILEVANTE, ...(emailMittente ? { emailMittente } : {}) },
  });

  try {
    await marcaNonRilevante(riga.messageId);
    await archiviaMail(riga.messageId);
    // Stesso bug di applicaEtichetteFinali (conferma/route.ts): se la riga era arrivata qui da
    // binario INCERTO, "Incerto/Da classificare" resta sul messaggio a meno di rimuoverla
    // esplicitamente — no-op innocuo se non era presente.
    await rimuoviEtichetta(riga.messageId, ETICHETTA_INCERTO);
  } catch {
    // Etichetta/archiviazione di comodo: la riga è comunque COMPLETATO/NON_RILEVANTE nel DB.
    // Reso visibile, non solo tollerato: stesso principio dei contatori di estrazione Bandi.
    await prisma.mailProcessata.update({ where: { id }, data: { archiviazioneFallita: true } }).catch(() => {});
  }

  return NextResponse.json({ completato: true });
}
