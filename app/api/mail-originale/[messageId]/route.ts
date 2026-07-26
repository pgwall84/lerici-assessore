import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getMailPerId } from "@/lib/gmail";
import { estraiMittenteReale } from "@/lib/inoltro";

// Testo completo del messaggio originale, a richiesta (redesign 2026-07-25) — usato dal pulsante
// "Mostra testo completo mail originale" sulle pagine di dettaglio di Pratica/Progetto/Atto/
// Contestazione. Ritorna corpoCompleto (non descrizione, troncata a 1500 caratteri) — stesso
// campo già esposto da /api/motore-mail/revisione per la preview in coda. Nessuna scrittura: solo
// lettura dal vivo da Gmail, il dato salvato sull'entità (se troncato) resta invariato.
export async function GET(req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { messageId } = await params;
  const mail = await getMailPerId(messageId);
  if (!mail) return NextResponse.json({ error: "Mail non trovata su Gmail" }, { status: 404 });

  return NextResponse.json({
    titolo: mail.titolo,
    corpoCompleto: mail.corpoCompleto,
    nomeMittente: mail.nomeMittente,
    data: mail.data,
    // Solo informativo (evolutiva 2026-07-26) — vedi lib/inoltro.ts. null se il messaggio non è
    // un inoltro riconoscibile, mai un dato indovinato.
    mittenteReale: estraiMittenteReale(mail.corpoCompleto),
  });
}
