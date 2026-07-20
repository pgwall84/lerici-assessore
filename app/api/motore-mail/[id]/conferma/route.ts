import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getMailPerId, marcaImportata, applicaEtichetta, caricaAllegatiMail } from "@/lib/gmail";
import { contentTypeDaNomeFile } from "@/lib/estrazione-documenti";
import { etichettaPerCategoria } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { eseguiConvocazione, eseguiMozioneOInterrogazione, eseguiVerbaleGiunta, eseguiGiustifica, eseguiContinuazione, eseguiCollegamento, type EsitoEsecuzione } from "@/lib/import-automatico";
import { decodificaEntita } from "@/lib/continuazione";
import type { MailImport } from "@/lib/gmail";
import type { Delega } from "@prisma/client";
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
  CONTINUAZIONE: m => eseguiContinuazione(m),
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

// Etichette di comodo — scritte sempre dopo COMPLETATO, sia quando l'etichetta di categoria
// era già presente su Gmail all'origine (la riscrive, idempotente) sia quando è stata dedotta
// da zero (AI o scelta manuale su Incerto/Proposta) e su Gmail non esiste ancora. Un fallimento
// qui non deve mai retrocedere l'esito: l'entità è comunque creata.
async function applicaEtichetteFinali(messageId: string, nomeEtichetta: string | null) {
  try { await marcaImportata(messageId); } catch { /* etichetta di comodo, non blocca l'esito */ }
  if (nomeEtichetta) {
    try { await applicaEtichetta(messageId, nomeEtichetta); } catch { /* etichetta di comodo, non blocca l'esito */ }
  }
}

// Conferma unica per qualunque riga MailProcessata IN_ATTESA (sezione 6, Sessione C):
// - AUTOMATICO: esegue il gestore già usato dal cron (Sessione B); se torna AMBIGUO, ritorna
//   l'elenco file per la scelta manuale, senza scrivere nulla — si richiama lo stesso endpoint
//   con indiceOdgForzato per completare.
// - PROPOSTA_CONTINUAZIONE (match debole, sezione 6 evolutiva): "collega" aggancia l'entità già
//   decisa in fase di scan (nessuna nuova ricerca, Marco l'ha già vista in UI); "nuova" ignora la
//   proposta e ricade nello stesso flusso di creazione di Manuale/Incerto qui sotto.
// - MANUALE / INCERTO: crea l'entità scelta/confermata da Marco (stessa logica già collaudata
//   nel vecchio POST di /api/import-mail, ora qui).
// In tutti i casi: DB (esito COMPLETATO) sempre prima delle etichette Gmail.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const riga = await prisma.mailProcessata.findUnique({ where: { id } });
  if (!riga) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  if (riga.esito !== "IN_ATTESA") return NextResponse.json({ error: "Questa riga è già stata gestita" }, { status: 409 });

  const mail = await getMailPerId(riga.messageId);
  if (!mail) return NextResponse.json({ error: "Mail non trovata su Gmail" }, { status: 404 });

  // Letto una sola volta: il branch AUTOMATICO/PROPOSTA_CONTINUAZIONE lo valida col proprio
  // schema, quello Manuale/Incerto/"Crea nuova" più sotto riusa lo stesso oggetto già letto.
  const body = await req.json().catch(() => ({}));

  if (riga.binario === "AUTOMATICO") {
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
    await applicaEtichetteFinali(riga.messageId, esito.etichetta ?? (riga.categoriaProposta ? etichettaPerCategoria(riga.categoriaProposta) : null));
    return NextResponse.json({ completato: true, entitaId: esito.entitaId });
  }

  if (riga.binario === "PROPOSTA_CONTINUAZIONE" && (body as { azione?: string })?.azione === "collega") {
    const decodificata = decodificaEntita(riga.categoriaProposta);
    if (!decodificata) return NextResponse.json({ error: "Proposta di continuazione non decodificabile" }, { status: 500 });

    const esito = await eseguiCollegamento(mail, decodificata.tipo, decodificata.id);
    if (esito.esito === "ERRORE") {
      await prisma.mailProcessata.update({ where: { id }, data: { esito: "ERRORE" } });
      return NextResponse.json({ error: esito.errore }, { status: 500 });
    }
    if (esito.esito === "COMPLETATO") {
      await prisma.mailProcessata.update({ where: { id }, data: { esito: "COMPLETATO", entitaCreataId: esito.entitaId } });
      await applicaEtichetteFinali(riga.messageId, esito.etichetta ?? null);
      return NextResponse.json({ completato: true, entitaId: esito.entitaId });
    }
    // "AMBIGUO" non è previsto per eseguiCollegamento — trattato come errore difensivo.
    return NextResponse.json({ error: "Esito inatteso" }, { status: 500 });
  }

  // MANUALE, INCERTO, o PROPOSTA_CONTINUAZIONE con "Crea nuova" (azione !== "collega")
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
  await applicaEtichetteFinali(riga.messageId, etichettaPerCategoria(d.categoria, d.delega as Delega | undefined));
  return NextResponse.json({ completato: true, entitaId });
}
