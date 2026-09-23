import { prisma } from "@/lib/prisma";
import { ALBERO_ETICHETTE_MAIL, ETICHETTA_DELEGA, ETICHETTA_NON_RILEVANTE, NOME_ENTE_FISSO, NOME_GESTORE_ENTRATA, PREFISSO_ALTRE_DELEGHE } from "@/lib/constants";

// Memoria del mittente (2026-09-21, richiesta di Marco: estendere l'automatismo il più possibile).
// Un mittente che Marco ha sempre sistemato allo stesso modo diventa un segnale deterministico per
// le sue mail successive — senza dover raccogliere a mano indirizzi come per Gestori/Enti. Si basa
// solo su decisioni prese da una persona (MailProcessata.etichettaFinale), mai su quelle già
// automatiche, per non auto-confermare i propri errori. Unanimità richiesta: un solo esito
// diverso nella storia del mittente annulla la proposta.

// Caselle interne del Comune: mandano mail su qualunque argomento, l'indirizzo non dice nulla.
const MITTENTI_ESCLUSI = ["@comune.lerici.sp.it", "comunedilerici@postecert.it"];

// Riduce un nome etichetta Gmail alla forma di classificazione confrontabile tra mail diverse:
// niente sotto-tema/Risolta ("Segnalazioni/Ambiente/Sfalci/Risolta" -> "Segnalazioni/Ambiente").
// null per le etichette non di classificazione (Importata, IMPORTANT, ...).
export function normalizzaEtichettaFinale(nome: string): string | null {
  if (nome === ETICHETTA_NON_RILEVANTE) return nome;
  const parti = nome.replace(/\/Risolta$/, "").split("/");
  if (parti[0] === "Segnalazioni") {
    if (parti.length === 1) return "Segnalazioni";
    return parti[1] in ETICHETTA_DELEGA ? `Segnalazioni/${parti[1]}` : null;
  }
  if ((parti[0] === "Istituzioni" || parti[0] === "Gestori" || parti[0] === PREFISSO_ALTRE_DELEGHE) && parti[1]) return `${parti[0]}/${parti[1]}`;
  return ALBERO_ETICHETTE_MAIL.some(n => n.etichetta === nome) ? nome : null;
}

// L'unica etichetta di classificazione presente su un messaggio, se ce n'è esattamente una
// ("Segnalazioni" piatta cede il posto a una "Segnalazioni/<Delega>" più specifica).
export function etichettaFinaleDaNomi(nomi: string[]): string | null {
  const trovate = new Set(nomi.map(normalizzaEtichettaFinale).filter((n): n is string => !!n));
  if (trovate.size > 1 && [...trovate].some(n => n.startsWith("Segnalazioni/"))) trovate.delete("Segnalazioni");
  return trovate.size === 1 ? [...trovate][0] : null;
}

export type PropostaMemoria = {
  categoriaProposta: string;
  etichettaProposta: string;
  binario: "AUTOMATICO" | "MANUALE" | "NON_RILEVANTE";
};

// Come trattare una mail il cui mittente è sempre stato sistemato con questa etichetta. Automatico
// solo dove l'esecuzione è già quella delle regole deterministiche esistenti (enti, gestori) o
// innocua (non rilevante); Deleghe/Segnalazioni/Contestazioni restano Manuali ma già pre-compilate.
function propostaDaEtichetta(et: string): { proposta: PropostaMemoria; minimo: number } | null {
  if (et === ETICHETTA_NON_RILEVANTE) {
    return { proposta: { categoriaProposta: "non_rilevante", etichettaProposta: et, binario: "NON_RILEVANTE" }, minimo: 3 };
  }
  const [gruppo, nome] = et.split("/");
  if (gruppo === "Istituzioni" && nome) {
    const fisso = (Object.entries(NOME_ENTE_FISSO) as [string, string][]).find(([, n]) => n.toLowerCase() === nome.toLowerCase());
    return { proposta: { categoriaProposta: fisso ? fisso[0] : `ENTE:${nome}`, etichettaProposta: et, binario: "AUTOMATICO" }, minimo: 2 };
  }
  if (gruppo === PREFISSO_ALTRE_DELEGHE && nome) {
    return { proposta: { categoriaProposta: `ALTRA_DELEGA:${nome}`, etichettaProposta: et, binario: "AUTOMATICO" }, minimo: 2 };
  }
  if (gruppo === "Gestori" && nome) {
    const chiave = Object.entries(NOME_GESTORE_ENTRATA).find(([, n]) => n.toLowerCase() === nome.toLowerCase())?.[0];
    return chiave ? { proposta: { categoriaProposta: chiave, etichettaProposta: et, binario: "AUTOMATICO" }, minimo: 2 } : null;
  }
  if (et === "Segnalazioni" || et.startsWith("Segnalazioni/")) {
    return { proposta: { categoriaProposta: "segnalazione", etichettaProposta: "Segnalazioni", binario: "MANUALE" }, minimo: 3 };
  }
  const nodo = ALBERO_ETICHETTE_MAIL.find(n => n.etichetta === et);
  if (nodo && (et.startsWith("Deleghe/") || nodo.categoria === "contestazione")) {
    return { proposta: { categoriaProposta: nodo.categoria, etichettaProposta: et, binario: "MANUALE" }, minimo: 3 };
  }
  return null;
}

export async function propostaDaMemoriaMittente(emailMittente: string): Promise<PropostaMemoria | null> {
  const email = emailMittente.toLowerCase().trim();
  if (!email || MITTENTI_ESCLUSI.some(e => email.endsWith(e))) return null;

  const righe = await prisma.mailProcessata.findMany({
    where: { emailMittente: email, etichettaFinale: { not: null } },
    select: { etichettaFinale: true },
  });
  const distinte = new Set(righe.map(r => r.etichettaFinale));
  if (distinte.size !== 1) return null;

  const risolta = propostaDaEtichetta([...distinte][0]!);
  return risolta && righe.length >= risolta.minimo ? risolta.proposta : null;
}
