import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getMailPerId, getMappaEtichette } from "@/lib/gmail";
import { trovaVoceTassonomia } from "@/lib/motore-mail";
import { classificaDelega, classificaGestore } from "@/lib/classificatore";

const TAKE = 10;

// Elenco (paginato) delle righe MailProcessata IN_ATTESA — sostituisce la vecchia paginazione
// live su Gmail di /api/import-mail: ora la fonte è sempre MailProcessata (sezione 6).
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const binario = searchParams.get("binario");
  const cursor = searchParams.get("cursor");

  const righe = await prisma.mailProcessata.findMany({
    where: { esito: "IN_ATTESA", ...(binario ? { binario: binario as never } : {}) },
    orderBy: { createdAt: "asc" },
    take: TAKE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const mappaEtichette = await getMappaEtichette();
  const mails = await Promise.all(righe.map(r => getMailPerId(r.messageId)));

  const risultato = righe.map((r, i) => {
    const mail = mails[i];
    if (!mail) return null;

    const nomiEtichette = mail.labelIds.map(lid => mappaEtichette.get(lid)).filter((n): n is string => !!n);
    const voceNota = trovaVoceTassonomia(nomiEtichette);
    const delegaSuggerita = voceNota && "delega" in voceNota
      ? voceNota.delega
      : classificaDelega(`${mail.titolo} ${mail.descrizione}`);

    return {
      mailProcessataId: r.id,
      binario: r.binario,
      categoriaProposta: r.categoriaProposta,
      confidenza: r.confidenza,
      messageId: mail.messageId,
      oggettoOriginale: mail.oggettoOriginale,
      mittente: mail.mittente,
      nomeMittente: mail.nomeMittente,
      emailMittente: mail.emailMittente,
      titolo: mail.titolo,
      descrizione: mail.descrizione,
      protocollo: mail.protocollo,
      dataProtocollo: mail.dataProtocollo,
      hasAllegati: mail.allegati.length > 0,
      nAllegati: mail.allegati.length,
      delegaSuggerita,
      gestoreSuggerito: classificaGestore(`${mail.mittente} ${mail.oggettoOriginale}`),
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  const nextCursor = righe.length === TAKE ? righe[righe.length - 1].id : null;
  return NextResponse.json({ mails: risultato, nextCursor });
}
