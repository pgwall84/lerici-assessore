import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getMailsSegnalazioni, marcaImportata } from "@/lib/gmail";
import { classificaDelega, estraiTitolo, estraiLuogo } from "@/lib/classificatore";
import { prisma } from "@/lib/prisma";

// GET — recupera mail da importare con classificazione automatica
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const mails = await getMailsSegnalazioni();

  const risultati = mails.map(m => {
    const testo = `${m.oggetto} ${m.corpo}`;
    const delega = classificaDelega(testo);
    const titolo = estraiTitolo(m.oggetto, m.corpo);
    const luogo = estraiLuogo(testo);

    // Estrai nome e email mittente: "Nome Cognome <email@example.com>"
    const matchEmail = m.mittente.match(/<(.+?)>/);
    const matchNome = m.mittente.match(/^([^<]+)</);
    const emailMittente = matchEmail?.[1] ?? m.mittente;
    const nomeMittente = matchNome?.[1]?.trim() ?? emailMittente;

    return {
      messageId: m.messageId,
      oggetto: m.oggetto,
      mittente: m.mittente,
      data: m.data,
      corpo: m.corpo,
      // Campi pre-compilati
      titolo,
      delega,
      luogo,
      nomeMittente,
      emailMittente,
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
    }[];
  };

  const create = importazioni.map(async (imp) => {
    const pratica = await prisma.pratica.create({
      data: {
        titolo: imp.titolo,
        descrizione: imp.descrizione || null,
        luogo: imp.luogo || null,
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

    await marcaImportata(imp.messageId);
    return pratica;
  });

  const pratiche = await Promise.all(create);
  return NextResponse.json({ importate: pratiche.length });
}
