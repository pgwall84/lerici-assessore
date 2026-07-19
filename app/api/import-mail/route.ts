import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getMailsSegnalazioni, getMailsPerEtichetta, marcaImportata, caricaAllegatiMail, type MailImport } from "@/lib/gmail";
import { classificaDelega } from "@/lib/classificatore";
import { ETICHETTA_DELEGA } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";

type Categoria = "segnalazione" | "progetto" | "contestazione";

const GESTORE_KEYWORDS: [RegExp, "ACAM_ACQUE" | "ACAM_AMBIENTE" | "ATC"][] = [
  [/acam.{0,3}acque/i, "ACAM_ACQUE"],
  [/acam.{0,3}ambiente/i, "ACAM_AMBIENTE"],
  [/\batc\b/i, "ATC"],
];

function classificaGestore(testo: string): "ACAM_ACQUE" | "ACAM_AMBIENTE" | "ATC" {
  for (const [re, gestore] of GESTORE_KEYWORDS) if (re.test(testo)) return gestore;
  return "ACAM_AMBIENTE";
}

// Recupera in un colpo solo tutte le mail candidate dai tre binari manuali, con la
// categoria e i campi suggeriti già assegnati. Usata sia da GET (anteprima) sia da
// POST (per riprendere gli allegati delle mail selezionate).
async function raccogliCandidate() {
  const [segnalazioni, contestazioni, ...deleghe] = await Promise.all([
    getMailsSegnalazioni(),
    getMailsPerEtichetta("Contestazioni"),
    ...Object.entries(ETICHETTA_DELEGA).map(([nomeEtichetta, delega]) =>
      getMailsPerEtichetta(`Deleghe/${nomeEtichetta}`).then(mails => ({ delega, mails }))
    ),
  ]);

  const campiComuni = (m: MailImport) => ({
    messageId: m.messageId,
    oggettoOriginale: m.oggettoOriginale,
    mittente: m.mittente,
    data: m.data,
    descrizione: m.descrizione,
    hasAllegati: m.allegati.length > 0,
    nAllegati: m.allegati.length,
    titolo: m.titolo,
    luogo: "",
    nomeMittente: m.nomeMittente,
    emailMittente: m.emailMittente,
    protocollo: m.protocollo,
    dataProtocollo: m.dataProtocollo,
  });

  const candidate = [
    ...segnalazioni.map(m => ({ ...campiComuni(m), categoria: "segnalazione" as Categoria, delega: classificaDelega(`${m.titolo} ${m.descrizione}`), gestore: "" })),
    ...deleghe.flatMap(({ delega, mails }) => mails.map(m => ({ ...campiComuni(m), categoria: "progetto" as Categoria, delega, gestore: "" }))),
    ...contestazioni.map(m => ({ ...campiComuni(m), categoria: "contestazione" as Categoria, delega: "", gestore: classificaGestore(`${m.mittente} ${m.oggettoOriginale}`) })),
  ];

  const mailMap = new Map<string, MailImport>([
    ...segnalazioni.map((m): [string, MailImport] => [m.messageId, m]),
    ...contestazioni.map((m): [string, MailImport] => [m.messageId, m]),
    ...deleghe.flatMap(({ mails }) => mails.map((m): [string, MailImport] => [m.messageId, m])),
  ]);

  return { candidate, mailMap };
}

async function caricaFile(cartella: string, buffer: Buffer, nomeFile: string): Promise<string> {
  const ext = nomeFile.includes(".") ? nomeFile.split(".").pop() : "bin";
  const filename = `${cartella}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("foto").upload(filename, buffer, { upsert: false });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = supabase.storage.from("foto").getPublicUrl(filename);
  return publicUrl;
}

// GET — recupera mail da importare (Segnalazioni, Deleghe→Progetto, Contestazioni) con classificazione automatica
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { candidate } = await raccogliCandidate();
  return NextResponse.json(candidate);
}

// POST — importa le mail selezionate: Segnalazioni, Progetti o Contestazioni a seconda della categoria
export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const { importazioni } = body as {
    importazioni: {
      messageId: string;
      categoria: Categoria;
      titolo: string;
      delega: string;
      gestore: string;
      descrizione: string;
      luogo: string;
      nomeMittente: string;
      emailMittente: string;
      protocollo: string;
      dataProtocollo: string;
    }[];
  };

  const { mailMap } = await raccogliCandidate();
  let importate = 0;

  for (const imp of importazioni) {
    const mailOriginale = mailMap.get(imp.messageId);

    if (imp.categoria === "segnalazione") {
      const pratica = await prisma.pratica.create({
        data: {
          titolo: imp.titolo,
          descrizione: imp.descrizione || null,
          luogo: imp.luogo || null,
          protocollo: imp.protocollo || null,
          dataProtocollo: imp.dataProtocollo || null,
          tipo: "SEGNALAZIONE",
          stato: "APERTA",
          priorita: "MEDIA",
          messageId: imp.messageId,
          delega: imp.delega as never,
          ...(imp.nomeMittente ? { segnalante: { create: { nome: imp.nomeMittente, email: imp.emailMittente || null } } } : {}),
        },
      });
      if (mailOriginale?.allegati?.length) {
        const urls = await caricaAllegatiMail(mailOriginale.allegati, pratica.id);
        await Promise.all(urls.map(url => prisma.foto.create({ data: { praticaId: pratica.id, path: url } })));
      }
    } else if (imp.categoria === "progetto") {
      const progetto = await prisma.progetto.create({
        data: {
          titolo: imp.titolo,
          delega: imp.delega as never,
          descrizione: imp.descrizione || null,
          messageId: imp.messageId,
        },
      });
      if (mailOriginale?.allegati?.length) {
        await Promise.all(mailOriginale.allegati.map(async a => {
          const url = await caricaFile(`progetto-${progetto.id}`, a.buffer, a.filename);
          await prisma.documentoProgetto.create({ data: { progettoId: progetto.id, nomeFile: a.filename, storageUrl: url } });
        }));
      }
    } else if (imp.categoria === "contestazione") {
      const contestazione = await prisma.contestazione.create({
        data: {
          gestore: imp.gestore as never,
          oggetto: imp.titolo,
          descrizione: imp.descrizione || null,
          messageId: imp.messageId,
        },
      });
      if (mailOriginale?.allegati?.length) {
        await Promise.all(mailOriginale.allegati.map(async a => {
          const url = await caricaFile(`contestazione-${contestazione.id}`, a.buffer, a.filename);
          await prisma.documentoContestazione.create({ data: { contestazioneId: contestazione.id, nomeFile: a.filename, storageUrl: url } });
        }));
      }
    }

    await marcaImportata(imp.messageId);
    importate++;
  }

  return NextResponse.json({ importate });
}
