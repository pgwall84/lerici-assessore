// Rilevamento "mittente reale" negli inoltri (evolutiva 2026-07-26): un messaggio inoltrato
// nasconde il vero mittente originale dietro quello tecnico di chi lo ha girato (es. una
// segreteria) — Gmail/gli header tecnici mostrano solo chi ha inoltrato, non chi ha scritto
// davvero. Caso reale che ha fatto emergere il problema: Pratica #41 — mittente tecnico
// "Segreteria del Sindaco", vero richiedente esterno leggibile solo dentro un blocco di
// intestazione inoltrata nel corpo mail ("Da: ... Inviato: ... A: ... Oggetto: ...").
// Solo informativo: nessun campo persistito, nessun automatismo di assegnazione — la scelta del
// referente resta sempre manuale, come già stabilito per il resto del tool.

// Richiede "Da:" seguito da "Inviato:" e "A:" in sequenza (righe successive) — non un "Da:" isolato
// che potrebbe comparire altrove nel testo (es. in una firma). Client italiani (Outlook/Gmail).
const BLOCCO_INOLTRO = /^Da:\s*(.+?)\s*[\r\n]+\s*Inviato:\s*.+?[\r\n]+\s*A:\s*.+/im;

export type MittenteReale = { nome: string | null; email: string | null };

/** Estrae nome/email del mittente originale da un blocco di intestazione inoltrata nel corpo
 * mail, se presente. Ritorna null se il messaggio non è un inoltro riconoscibile — nessun dato
 * indovinato: meglio non mostrare nulla che mostrare un'origine incerta. */
export function estraiMittenteReale(corpoCompleto: string): MittenteReale | null {
  const match = corpoCompleto.match(BLOCCO_INOLTRO);
  if (!match) return null;

  const riga = match[1].trim();
  const emailMatch = riga.match(/<(.+?)>/) ?? riga.match(/([^\s<>]+@[^\s<>]+)/);
  const email = emailMatch?.[1]?.trim() ?? null;
  const nome = riga.replace(/<.+?>/, "").replace(email ?? "", "").trim();

  if (!email && !nome) return null;
  return { nome: nome && nome !== email ? nome : null, email };
}
