import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getMailPerId, getMappaEtichette } from "@/lib/gmail";
import { trovaVoceTassonomia, calcolaEtichettaProposta } from "@/lib/motore-mail";
import { classificaDelega, classificaGestore } from "@/lib/classificatore";
import { decodificaEntita, trovaMessaggioPrecedenteNonProcessato, trovaEntitaEsistenteNelThread } from "@/lib/continuazione";

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

  const risultato = await Promise.all(righe.map(async (r, i) => {
    const mail = mails[i];
    if (!mail) return null;

    // Match debole o protocollo ambiguo (sezione 6 evolutiva): l'entità candidata è già decisa
    // in fase di scan (codificata in categoriaProposta) — qui si recupera solo il titolo
    // aggiornato per mostrarla. `ambiguo: true` = il protocollo corrispondeva a più di
    // un'entità, questa è solo la prima trovata: mai da dare per buona senza verificare.
    let entitaProposta: { tipo: string; id: string; titolo: string; ambiguo: boolean } | null = null;
    if (r.binario === "PROPOSTA_CONTINUAZIONE") {
      const decodificata = decodificaEntita(r.categoriaProposta);
      if (decodificata) {
        const titolo =
          decodificata.tipo === "pratica" ? (await prisma.pratica.findUnique({ where: { id: Number(decodificata.id) } }))?.titolo
          : decodificata.tipo === "progetto" ? (await prisma.progetto.findUnique({ where: { id: decodificata.id } }))?.titolo
          : (await prisma.contestazione.findUnique({ where: { id: decodificata.id } }))?.oggetto;
        if (titolo) entitaProposta = { tipo: decodificata.tipo, id: decodificata.id, titolo, ambiguo: decodificata.ambiguo };
      }
    }

    const nomiEtichette = mail.labelIds.map(lid => mappaEtichette.get(lid)).filter((n): n is string => !!n);
    const voceNota = trovaVoceTassonomia(nomiEtichette);
    // "" (non null) quando nessuna euristica trova una delega attendibile — il client mostra un
    // placeholder esplicito nel selettore invece di preselezionare una delega indovinata a caso.
    const delegaSuggerita = voceNota && "delega" in voceNota.voce
      ? voceNota.voce.delega
      : classificaDelega(`${mail.titolo} ${mail.descrizione}`) ?? "";

    // Righe scansionate da Fase B in poi hanno già etichettaProposta persistita; per quelle più
    // vecchie si ricostruisce al volo — prima da un match di regola ancora valido su Gmail (più
    // affidabile), poi dalla categoria già salvata (nessuna nuova chiamata AI in ogni caso).
    const etichettaProposta = r.etichettaProposta
      ?? voceNota?.etichetta
      ?? calcolaEtichettaProposta(r.categoriaProposta, `${mail.titolo} ${mail.descrizione}`);

    // Prima di mostrare la mail come base per una nuova entità (Manuale/Incerto — Automatico
    // segue invece un trattamento diverso, vedi endpoint di conferma): verifica se un messaggio
    // precedente nello stesso thread, mai processato, ha probabilmente il contesto pieno.
    // Mostrato in chiaro qui, PRIMA della conferma finale — resta sotto controllo umano anche se
    // lo scambio è automatico (diagnosi 2026-07-25).
    const messaggioPrecedente = (r.binario === "MANUALE" || r.binario === "INCERTO")
      ? await trovaMessaggioPrecedenteNonProcessato(mail)
      : null;
    const mailBase = messaggioPrecedente ?? mail;

    // Complementare allo swap sopra (diagnosi 2026-07-25): se il thread contiene già un'entità
    // nota (anche creata prima che MailProcessata esistesse — vedi Pratica #16, caso reale),
    // propone il collegamento diretto invece di lasciare la riga come "Manuale" generico da
    // agganciare a mano con una ricerca per titolo che spesso non trova nulla. Mai insieme allo
    // swap: se c'è uno swap, trovaMessaggioPrecedenteNonProcessato ha già escluso questo caso.
    const entitaEsistenteThread = (!messaggioPrecedente && (r.binario === "MANUALE" || r.binario === "INCERTO"))
      ? await trovaEntitaEsistenteNelThread(mail)
      : null;

    return {
      mailProcessataId: r.id,
      binario: r.binario,
      categoriaProposta: r.categoriaProposta,
      etichettaProposta,
      confidenza: r.confidenza,
      messageId: mail.messageId,
      oggettoOriginale: mail.oggettoOriginale,
      mittente: mail.mittente,
      nomeMittente: mail.nomeMittente,
      emailMittente: mail.emailMittente,
      titolo: mailBase.titolo,
      // Non troncato a 1500 come descrizione (che resta così solo per le chiamate AI) — la
      // preview in UI mostrava un corpo tagliato a metà frase, vedi diagnosi 2026-07-25.
      corpoCompleto: mailBase.corpoCompleto,
      descrizione: mailBase.descrizione,
      protocollo: mail.protocollo,
      dataProtocollo: mail.dataProtocollo,
      hasAllegati: mail.allegati.length > 0,
      nAllegati: mail.allegati.length,
      delegaSuggerita,
      gestoreSuggerito: classificaGestore(`${mail.mittente} ${mail.oggettoOriginale}`),
      entitaProposta,
      messaggioPrecedente: messaggioPrecedente
        ? { messageId: messaggioPrecedente.messageId, oggetto: messaggioPrecedente.titolo, data: messaggioPrecedente.data }
        : null,
      entitaEsistenteThread,
    };
  }));
  const risultatoFiltrato = risultato.filter((r): r is NonNullable<typeof r> => r !== null);

  const nextCursor = righe.length === TAKE ? righe[righe.length - 1].id : null;
  return NextResponse.json({ mails: risultatoFiltrato, nextCursor });
}
