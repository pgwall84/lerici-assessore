import { prisma } from "@/lib/prisma";
import { getMailPerId, type MailImport } from "@/lib/gmail";

export type TipoEntitaContinuazione = "pratica" | "progetto" | "contestazione";

export type EntitaTrovata = {
  tipo: TipoEntitaContinuazione;
  id: string;
  titolo: string;
};

/** Codifica/decodifica la coppia tipo+id (+ flag ambiguo) in categoriaProposta per
 * PROPOSTA_CONTINUAZIONE (nessuna colonna nuova su MailProcessata per questo — stesso principio
 * già usato per gli altri binari: la stringa libera basta, si ri-deriva il resto dai dati vivi
 * quando serve). `ambiguo: true` segnala che il protocollo corrispondeva a più di un'entità e
 * questa è solo la prima trovata — va mostrato con un avviso, non spacciato per un match pulito. */
export function codificaEntita(e: EntitaTrovata, ambiguo = false): string {
  return `${e.tipo}:${e.id}${ambiguo ? ":ambiguo" : ""}`;
}

export function decodificaEntita(categoriaProposta: string | null): { tipo: TipoEntitaContinuazione; id: string; ambiguo: boolean } | null {
  if (!categoriaProposta) return null;
  const [tipo, id, flag] = categoriaProposta.split(":");
  if (tipo !== "pratica" && tipo !== "progetto" && tipo !== "contestazione") return null;
  if (!id) return null;
  return { tipo, id, ambiguo: flag === "ambiguo" };
}

export type RisultatoProtocollo =
  | { esito: "nessuno" }
  | { esito: "univoco"; entita: EntitaTrovata }
  // Più di una riga (anche tra tabelle diverse) condivide lo stesso protocollo — non si indovina
  // quale sia quella giusta: il chiamante deve trattarlo come il match debole (conferma umana),
  // mai come esecuzione automatica.
  | { esito: "ambiguo"; candidati: EntitaTrovata[] };

async function trovaPerProtocollo(protocollo: string): Promise<RisultatoProtocollo> {
  const [pratiche, progetti, contestazioni] = await Promise.all([
    prisma.pratica.findMany({ where: { protocollo } }),
    prisma.progetto.findMany({ where: { protocollo } }),
    prisma.contestazione.findMany({ where: { protocollo } }),
  ]);

  const candidati: EntitaTrovata[] = [
    ...pratiche.map(p => ({ tipo: "pratica" as const, id: String(p.id), titolo: p.titolo })),
    ...progetti.map(p => ({ tipo: "progetto" as const, id: p.id, titolo: p.titolo })),
    ...contestazioni.map(c => ({ tipo: "contestazione" as const, id: c.id, titolo: c.oggetto })),
  ];

  if (candidati.length === 0) return { esito: "nessuno" };
  if (candidati.length === 1) return { esito: "univoco", entita: candidati[0] };
  return { esito: "ambiguo", candidati };
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

export type RisultatoContinuazioneForte =
  | { esito: "nessuno" }
  | { esito: "trovato"; entita: EntitaTrovata }
  // Protocollo con più di una corrispondenza: MAI eseguito in automatico, va trattato come il
  // match debole (conferma umana) — vedi commento su RisultatoProtocollo["ambiguo"] sopra.
  | { esito: "ambiguo"; candidati: EntitaTrovata[] };

/**
 * Livelli 1-2 della catena (sezione 6 evolutiva): protocollo, poi threadId. Match forte,
 * eseguibile in automatico solo se univoco — se il protocollo è ambiguo, si ferma lì e ritorna
 * "ambiguo" senza controllare il threadId (il protocollo è comunque il segnale più affidabile:
 * se è ambiguo lui, non ha senso proseguire su un segnale più debole per zittire l'ambiguità).
 */
export async function trovaContinuazioneForte(m: MailImport): Promise<RisultatoContinuazioneForte> {
  if (m.protocollo) {
    const perProtocollo = await trovaPerProtocollo(m.protocollo);
    if (perProtocollo.esito === "univoco") return { esito: "trovato", entita: perProtocollo.entita };
    if (perProtocollo.esito === "ambiguo") return { esito: "ambiguo", candidati: perProtocollo.candidati };
  }
  if (m.threadId) {
    const perThread = await trovaPerThreadId(m.threadId);
    if (perThread) return { esito: "trovato", entita: perThread };
  }
  return { esito: "nessuno" };
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
