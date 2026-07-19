import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getMailPerId, marcaImportata, caricaAllegatiMail } from "@/lib/gmail";
import { contentTypeDaNomeFile } from "@/lib/estrazione-documenti";
import { supabase } from "@/lib/supabase";
import { eseguiConvocazione, eseguiMozioneOInterrogazione, eseguiVerbaleGiunta, eseguiGiustifica, type EsitoEsecuzione } from "@/lib/import-automatico";
import type { MailImport } from "@/lib/gmail";
import { z } from "zod";

const DELEGHE = [
  "VIABILITA", "AMBIENTE", "RIFIUTI", "SISTEMA_IDRICO", "ILLUMINAZIONE",
  "ACCESSIBILITA", "CIMITERI", "POLITICHE_ABITATIVE", "DIGITALIZZAZIONE", "MANUTENZIONE_PATRIMONIO",
] as const;

const schemaAutomatico = z.object({
  indiceOdgForzato: z.number().int().min(0).optional(),
});

const schemaManuale = z.object({
  categoria: z.enum(["segnalazione", "progetto", "contestazione", "giustifica"]),
  titolo: z.string().min(1).max(200),
  descrizione: z.string().optional(),
  delega: z.enum(DELEGHE).optional(),
  gestore: z.enum(["ACAM_AMBIENTE", "ACAM_ACQUE", "ATC"]).optional(),
  luogo: z.string().optional(),
  nomeMittente: z.string().optional(),
  emailMittente: z.string().optional(),
  protocollo: z.string().optional(),
  dataProtocollo: z.string().optional(),
});

const GESTORI_AUTOMATICO: Record<string, (m: MailImport, indiceOdgForzato?: number) => Promise<EsitoEsecuzione>> = {
  CONVOCAZIONE_CONSIGLIO: (m, i) => eseguiConvocazione(m, "CONVOCAZIONE_CONSIGLIO", i),
  CONVOCAZIONE_COMMISSIONE: (m, i) => eseguiConvocazione(m, "CONVOCAZIONE_COMMISSIONE", i),
  CONVOCAZIONE_GIUNTA: (m, i) => eseguiConvocazione(m, "CONVOCAZIONE_GIUNTA", i),
  MOZIONE: m => eseguiMozioneOInterrogazione(m, "MOZIONE"),
  INTERROGAZIONE: m => eseguiMozioneOInterrogazione(m, "INTERROGAZIONE"),
  VERBALE_GIUNTA: m => eseguiVerbaleGiunta(m),
  GIUSTIFICA: m => eseguiGiustifica(m),
};

async function caricaFile(cartella: string, buffer: Buffer, nomeFile: string): Promise<string> {
  const ext = nomeFile.includes(".") ? nomeFile.split(".").pop() : "bin";
  const filename = `${cartella}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("foto").upload(filename, buffer, {
    contentType: contentTypeDaNomeFile(nomeFile),
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = supabase.storage.from("foto").getPublicUrl(filename);
  return publicUrl;
}

// Conferma unica per qualunque riga MailProcessata IN_ATTESA (sezione 6, Sessione C):
// - AUTOMATICO: esegue il gestore già usato dal cron (Sessione B); se torna AMBIGUO, ritorna
//   l'elenco file per la scelta manuale, senza scrivere nulla — si richiama lo stesso endpoint
//   con indiceOdgForzato per completare.
// - MANUALE / INCERTO: crea l'entità scelta/confermata da Marco (stessa logica già collaudata
//   nel vecchio POST di /api/import-mail, ora qui).
// In entrambi i casi: DB (esito COMPLETATO) sempre prima dell'etichetta Gmail "Importata".
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const riga = await prisma.mailProcessata.findUnique({ where: { id } });
  if (!riga) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  if (riga.esito !== "IN_ATTESA") return NextResponse.json({ error: "Questa riga è già stata gestita" }, { status: 409 });

  const mail = await getMailPerId(riga.messageId);
  if (!mail) return NextResponse.json({ error: "Mail non trovata su Gmail" }, { status: 404 });

  if (riga.binario === "AUTOMATICO") {
    const body = await req.json().catch(() => ({}));
    const parsed = schemaAutomatico.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const gestore = riga.categoriaProposta ? GESTORI_AUTOMATICO[riga.categoriaProposta] : undefined;
    if (!gestore) return NextResponse.json({ error: "Categoria Automatico non riconosciuta" }, { status: 500 });

    const esito = await gestore(mail, parsed.data.indiceOdgForzato);

    if (esito.esito === "AMBIGUO") {
      return NextResponse.json({ ambiguo: true, candidati: esito.candidati });
    }
    if (esito.esito === "ERRORE") {
      await prisma.mailProcessata.update({ where: { id }, data: { esito: "ERRORE" } });
      return NextResponse.json({ error: esito.errore }, { status: 500 });
    }

    await prisma.mailProcessata.update({ where: { id }, data: { esito: "COMPLETATO", entitaCreataId: esito.entitaId } });
    try { await marcaImportata(riga.messageId); } catch { /* etichetta di comodo, non blocca l'esito */ }
    return NextResponse.json({ completato: true, entitaId: esito.entitaId });
  }

  // MANUALE o INCERTO
  const body = await req.json();
  const parsed = schemaManuale.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  if ((d.categoria === "segnalazione" || d.categoria === "progetto") && !d.delega) {
    return NextResponse.json({ error: "Delega obbligatoria" }, { status: 400 });
  }
  if (d.categoria === "contestazione" && !d.gestore) {
    return NextResponse.json({ error: "Gestore obbligatorio" }, { status: 400 });
  }

  let entitaId: string;
  try {
    if (d.categoria === "segnalazione") {
      const pratica = await prisma.pratica.create({
        data: {
          titolo: d.titolo,
          descrizione: d.descrizione || null,
          luogo: d.luogo || null,
          protocollo: d.protocollo || null,
          dataProtocollo: d.dataProtocollo || null,
          tipo: "SEGNALAZIONE",
          stato: "APERTA",
          priorita: "MEDIA",
          messageId: riga.messageId,
          delega: d.delega as never,
          ...(d.nomeMittente ? { segnalante: { create: { nome: d.nomeMittente, email: d.emailMittente || null } } } : {}),
        },
      });
      if (mail.allegati.length) {
        const urls = await caricaAllegatiMail(mail.allegati, pratica.id);
        await Promise.all(urls.map(url => prisma.foto.create({ data: { praticaId: pratica.id, path: url } })));
      }
      entitaId = String(pratica.id);
    } else if (d.categoria === "progetto") {
      const progetto = await prisma.progetto.create({
        data: { titolo: d.titolo, delega: d.delega as never, descrizione: d.descrizione || null, messageId: riga.messageId },
      });
      await Promise.all(mail.allegati.map(async a => {
        const url = await caricaFile(`progetto-${progetto.id}`, a.buffer, a.filename);
        await prisma.documentoProgetto.create({ data: { progettoId: progetto.id, nomeFile: a.filename, storageUrl: url } });
      }));
      entitaId = progetto.id;
    } else if (d.categoria === "contestazione") {
      const contestazione = await prisma.contestazione.create({
        data: { gestore: d.gestore as never, oggetto: d.titolo, descrizione: d.descrizione || null, messageId: riga.messageId },
      });
      await Promise.all(mail.allegati.map(async a => {
        const url = await caricaFile(`contestazione-${contestazione.id}`, a.buffer, a.filename);
        await prisma.documentoContestazione.create({ data: { contestazioneId: contestazione.id, nomeFile: a.filename, storageUrl: url } });
      }));
      entitaId = contestazione.id;
    } else {
      const giustifica = await prisma.giustifica.create({
        data: { oggetto: d.titolo, ufficioMittente: d.nomeMittente || mail.nomeMittente || null, messageId: riga.messageId },
      });
      await Promise.all(mail.allegati.map(async a => {
        const url = await caricaFile(`giustifica-${giustifica.id}`, a.buffer, a.filename);
        await prisma.documentoGiustifica.create({ data: { giustificaId: giustifica.id, nomeFile: a.filename, storageUrl: url } });
      }));
      entitaId = giustifica.id;
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  await prisma.mailProcessata.update({ where: { id }, data: { esito: "COMPLETATO", entitaCreataId: entitaId } });
  try { await marcaImportata(riga.messageId); } catch { /* etichetta di comodo, non blocca l'esito */ }
  return NextResponse.json({ completato: true, entitaId });
}
