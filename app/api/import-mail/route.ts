import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getMailsSegnalazioni, marcaImportata, caricaFotoMail } from "@/lib/gmail";
import { classificaDelega } from "@/lib/classificatore";
import { prisma } from "@/lib/prisma";

// GET — recupera mail da importare con classificazione automatica
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const mails = await getMailsSegnalazioni();

  const risultati = mails.map(m => {
    const testo = `${m.titolo} ${m.descrizione}`;
    const delega = classificaDelega(testo);

    return {
      messageId: m.messageId,
      oggettoOriginale: m.oggettoOriginale,
      mittente: m.mittente,
      data: m.data,
      descrizione: m.descrizione,
      hasFoto: m.fotoData.length > 0,
      nFoto: m.fotoData.length,
      titolo: m.titolo,
      delega,
      luogo: "",
      nomeMittente: m.nomeMittente,
      emailMittente: m.emailMittente,
      protocollo: m.protocollo,
      dataProtocollo: m.dataProtocollo,
    };
  });

  return NextResponse.json(risultati);
}

// POST — importa le mail selezionate come segnalazioni
export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const { importazioni } = body as {
    importazioni: {
      messageId: string;
      titolo: string;
      delega: string;
      descrizione: string;
      luogo: string;
      nomeMittente: string;
      emailMittente: string;
      protocollo: string;
      dataProtocollo: string;
    }[];
  };

  // Ricarica le mail originali per avere le foto
  const tutteleMails = await getMailsSegnalazioni();
  const mailMap = new Map(tutteleMails.map(m => [m.messageId, m]));

  const pratiche = await Promise.all(importazioni.map(async (imp) => {
    const pratica = await prisma.pratica.create({
      data: {
        titolo: imp.titolo,
        descrizione: imp.descrizione || null,
        luogo: imp.luogo || null,
        protocollo: imp.protocollo || null,
        dataProtocollo: imp.dataProtocollo || null,
        tipo: "SEGNALAZIONE",
        stato: "APERTA",
        priorita: "NORMALE",
        delega: imp.delega as never,
        ...(imp.nomeMittente ? {
          segnalante: {
            create: {
              nome: imp.nomeMittente,
              email: imp.emailMittente || null,
            },
          },
        } : {}),
      },
    });

    // Carica le foto se presenti
    const mailOriginale = mailMap.get(imp.messageId);
    if (mailOriginale?.fotoData?.length) {
      const urls = await caricaFotoMail(mailOriginale.fotoData, pratica.id);
      await Promise.all(urls.map(url =>
        prisma.foto.create({ data: { praticaId: pratica.id, path: url } })
      ));
    }

    await marcaImportata(imp.messageId);
    return pratica;
  }));

  return NextResponse.json({ importate: pratiche.length });
}
