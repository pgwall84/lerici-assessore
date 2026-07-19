import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getMailPerId, getMailsPerEtichettaPaginato, marcaImportata, caricaAllegatiMail, type MailImport } from "@/lib/gmail";
import { classificaDelega } from "@/lib/classificatore";
import { ETICHETTA_DELEGA } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";

type Categoria = "segnalazione" | "progetto" | "contestazione";

// Ordine fisso delle fonti attraversate dalla paginazione: prima le Segnalazioni, poi ogni
// sotto-etichetta Deleghe (→ Progetto), infine le Contestazioni.
const FONTI: { nomeEtichetta: string; categoria: Categoria; delega?: string }[] = [
  { nomeEtichetta: "Segnalazioni", categoria: "segnalazione" },
  ...Object.entries(ETICHETTA_DELEGA).map(([nomeEtichetta, delega]) => ({
    nomeEtichetta: `Deleghe/${nomeEtichetta}`, categoria: "progetto" as Categoria, delega,
  })),
  { nomeEtichetta: "Contestazioni", categoria: "contestazione" as Categoria },
];

const GESTORE_KEYWORDS: [RegExp, "ACAM_ACQUE" | "ACAM_AMBIENTE" | "ATC"][] = [
  [/acam.{0,3}acque/i, "ACAM_ACQUE"],
  [/acam.{0,3}ambiente/i, "ACAM_AMBIENTE"],
  [/\batc\b/i, "ATC"],
];

function classificaGestore(testo: string): "ACAM_ACQUE" | "ACAM_AMBIENTE" | "ATC" {
  for (const [re, gestore] of GESTORE_KEYWORDS) if (re.test(testo)) return gestore;
  return "ACAM_AMBIENTE";
}

function campiComuni(m: MailImport) {
  return {
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
  };
}

// GET — pagina di ~10 mail candidate, attraversando le fonti nell'ordine di FONTI.
// Query: ?fonte=<indice>&pageToken=<token>. Salta da solo le fonti esaurite/vuote finché
// non accumula almeno una mail o finisce le fonti, cosi il bottone "Carica altre" non
// restituisce mai un batch vuoto a meno che non sia davvero finito.
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  let fonte = Number(searchParams.get("fonte") ?? "0");
  let pageToken = searchParams.get("pageToken") ?? undefined;

  type Candidata = ReturnType<typeof campiComuni> & { categoria: Categoria; delega: string; gestore: string };
  const candidate: Candidata[] = [];

  while (fonte < FONTI.length && candidate.length === 0) {
    const f = FONTI[fonte];
    const { mails, nextPageToken } = await getMailsPerEtichettaPaginato(f.nomeEtichetta, pageToken, 10);

    for (const m of mails) {
      candidate.push({
        ...campiComuni(m),
        categoria: f.categoria,
        delega: f.categoria === "progetto" ? f.delega! : f.categoria === "segnalazione" ? classificaDelega(`${m.titolo} ${m.descrizione}`) : "",
        gestore: f.categoria === "contestazione" ? classificaGestore(`${m.mittente} ${m.oggettoOriginale}`) : "",
      });
    }

    if (nextPageToken) {
      pageToken = nextPageToken;
      break; // pagina piena o parziale su questa fonte, ma la fonte ha ancora altro: fermati qui
    } else {
      fonte++;
      pageToken = undefined; // fonte esaurita, passa alla prossima
    }
  }

  const nextCursor = fonte < FONTI.length ? { fonte, pageToken } : null;
  return NextResponse.json({ mails: candidate, nextCursor });
}

async function caricaFile(cartella: string, buffer: Buffer, nomeFile: string): Promise<string> {
  const ext = nomeFile.includes(".") ? nomeFile.split(".").pop() : "bin";
  const filename = `${cartella}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("foto").upload(filename, buffer, { upsert: false });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = supabase.storage.from("foto").getPublicUrl(filename);
  return publicUrl;
}

// POST — importa le mail selezionate: Segnalazioni, Progetti o Contestazioni a seconda della categoria.
// Recupera ogni mail per id, senza rielencare le etichette di provenienza.
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

  const originali = await Promise.all(importazioni.map(imp => getMailPerId(imp.messageId)));
  const mailMap = new Map(importazioni.map((imp, i) => [imp.messageId, originali[i]]));

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
