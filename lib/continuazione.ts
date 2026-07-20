import { prisma } from "@/lib/prisma";
import { getMailPerId, type MailImport } from "@/lib/gmail";

export type TipoEntitaContinuazione = "pratica" | "progetto" | "contestazione";

export type EntitaTrovata = {
  tipo: TipoEntitaContinuazione;
  id: string;
  titolo: string;
};

/** Codifica/decodifica la coppia tipo+id in categoriaProposta per PROPOSTA_CONTINUAZIONE
 * (nessuna colonna nuova su MailProcessata per questo — stesso principio già usato per gli
 * altri binari: la stringa libera basta, si ri-deriva il resto dai dati vivi quando serve). */
export function codificaEntita(e: EntitaTrovata): string {
  return `${e.tipo}:${e.id}`;
}

export function decodificaEntita(categoriaProposta: string | null): { tipo: TipoEntitaContinuazione; id: string } | null {
  if (!categoriaProposta) return null;
  const [tipo, id] = categoriaProposta.split(":");
  if (tipo !== "pratica" && tipo !== "progetto" && tipo !== "contestazione") return null;
  if (!id) return null;
  return { tipo, id };
}

async function trovaPerProtocollo(protocollo: string): Promise<EntitaTrovata | null> {
  const pratica = await prisma.pratica.findFirst({ where: { protocollo } });
  if (pratica) return { tipo: "pratica", id: String(pratica.id), titolo: pratica.titolo };

  const progetto = await prisma.progetto.findFirst({ where: { protocollo } });
  if (progetto) return { tipo: "progetto", id: progetto.id, titolo: progetto.titolo };

  const contestazione = await prisma.contestazione.findFirst({ where: { protocollo } });
  if (contestazione) return { tipo: "contestazione", id: contestazione.id, titolo: contestazione.oggetto };

  return null;
}

// categoriaProposta -> tipo di entità, solo per le 3 categorie del binario Manuale coinvolte
// nella catena di continuazione (Atti/Giustifiche hanno già un proprio matching, sezione 5/B).
function tipoPerCategoriaProposta(categoria: string | null): TipoEntitaContinuazione | null {
  if (categoria === "segnalazione") return "pratica";
  if (categoria === "progetto") return "progetto";
  if (categoria === "contestazione") return "contestazione";
  return null;
}

async function trovaPerThreadId(threadId: string): Promise<EntitaTrovata | null> {
  const precedente = await prisma.mailProcessata.findFirst({
    where: { threadId, esito: "COMPLETATO", entitaCreataId: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (!precedente?.entitaCreataId) return null;

  const tipo = tipoPerCategoriaProposta(precedente.categoriaProposta);
  if (!tipo) return null; // thread di un atto/giustifica/continuazione precedente: fuori scope qui

  if (tipo === "pratica") {
    const pratica = await prisma.pratica.findUnique({ where: { id: Number(precedente.entitaCreataId) } });
    return pratica ? { tipo, id: String(pratica.id), titolo: pratica.titolo } : null;
  }
  if (tipo === "progetto") {
    const progetto = await prisma.progetto.findUnique({ where: { id: precedente.entitaCreataId } });
    return progetto ? { tipo, id: progetto.id, titolo: progetto.titolo } : null;
  }
  const contestazione = await prisma.contestazione.findUnique({ where: { id: precedente.entitaCreataId } });
  return contestazione ? { tipo, id: contestazione.id, titolo: contestazione.oggetto } : null;
}

/**
 * Livelli 1-2 della catena (sezione 6 evolutiva): protocollo, poi threadId. Match forte,
 * eseguibile in automatico — se trovato, la mail non crea una nuova entità ma si aggancia.
 */
export async function trovaContinuazioneForte(m: MailImport): Promise<EntitaTrovata | null> {
  if (m.protocollo) {
    const perProtocollo = await trovaPerProtocollo(m.protocollo);
    if (perProtocollo) return perProtocollo;
  }
  if (m.threadId) {
    const perThread = await trovaPerThreadId(m.threadId);
    if (perThread) return perThread;
  }
  return null;
}

// Rimuove prefissi di risposta/inoltro, per confrontare l'oggetto "sostanziale" tra mail diverse
// della stessa conversazione. Stessi prefissi già gestiti da pulisciOggetto in lib/gmail.ts, ma
// qui serve la stringa normalizzata per il confronto, non per la visualizzazione.
function normalizzaOggetto(oggetto: string): string {
  return oggetto
    .replace(/^(re|r|fwd?|i)\s*:\s*/gi, "")
    .trim()
    .toLowerCase();
}

/**
 * Livello 3 della catena: match debole per oggetto normalizzato + mittente coincidente.
 * Mai eseguito in automatico — genera solo una proposta (binario PROPOSTA_CONTINUAZIONE).
 * Nessun campo "destinatario" tracciato oggi su Progetto/Contestazione: il confronto è solo
 * sul mittente originale, recuperato dal messageId salvato sull'entità candidata.
 */
export async function trovaContinuazioneDebole(m: MailImport): Promise<EntitaTrovata | null> {
  const oggettoNorm = normalizzaOggetto(m.oggettoOriginale);
  if (oggettoNorm.length < 8) return null; // oggetti troppo corti/generici, troppo rischio di falsi positivi

  const [pratiche, progetti, contestazioni] = await Promise.all([
    prisma.pratica.findMany({ where: { titolo: { contains: oggettoNorm, mode: "insensitive" } } }),
    prisma.progetto.findMany({ where: { titolo: { contains: oggettoNorm, mode: "insensitive" } } }),
    prisma.contestazione.findMany({ where: { oggetto: { contains: oggettoNorm, mode: "insensitive" } } }),
  ]);

  const candidati: { tipo: TipoEntitaContinuazione; id: string; titolo: string; messageId: string | null }[] = [
    ...pratiche.map(p => ({ tipo: "pratica" as const, id: String(p.id), titolo: p.titolo, messageId: p.messageId })),
    ...progetti.map(p => ({ tipo: "progetto" as const, id: p.id, titolo: p.titolo, messageId: p.messageId })),
    ...contestazioni.map(c => ({ tipo: "contestazione" as const, id: c.id, titolo: c.oggetto, messageId: c.messageId })),
  ];

  for (const candidato of candidati) {
    if (!candidato.messageId) continue;
    const mailOriginale = await getMailPerId(candidato.messageId);
    if (!mailOriginale) continue;
    if (mailOriginale.emailMittente && mailOriginale.emailMittente === m.emailMittente) {
      return { tipo: candidato.tipo, id: candidato.id, titolo: candidato.titolo };
    }
  }
  return null;
}
