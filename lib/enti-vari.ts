import { prisma } from "@/lib/prisma";

// Trova o crea un EnteVario per nome (Fase 2 sezione 5) — usato sia dal binario Automatico
// (ANCI/Regione/Governo, nomi fissi noti) sia dal form di conferma mail/creazione Progetto quando
// Marco digita un nome di ente nuovo mai visto prima: in entrambi i casi non deve servire una
// migration, la riga nasce al volo la prima volta che il nome compare.
// Confronto case-insensitive (2026-09-21): il codice chiamava eseguiProgettoVarie con "REGIONE" e
// "GOVERNO" mentre gli enti seed si chiamano "Regione"/"Governo" — un upsert esatto creava un
// duplicato "REGIONE". Stesso principio già applicato ai nomi etichetta Gmail (NOTE-TECNICHE #23).
export async function trovaOCreaEnteVario(nome: string) {
  const nomeTrim = nome.trim();
  const esistente = await prisma.enteVario.findFirst({ where: { nome: { equals: nomeTrim, mode: "insensitive" } } });
  if (esistente) return esistente;
  return prisma.enteVario.create({ data: { nome: nomeTrim } });
}

// Risolve l'id EnteVario da usare per un Progetto, dato quanto arriva dal client: un id esistente
// (scelto da una lista già caricata) oppure un nome nuovo da creare al volo. Mai entrambi — se
// arrivano entrambi, l'id esistente vince (nuovoEnteNome viene ignorato).
export async function risolviEnteVarioId(input: { enteVarioId?: string; nuovoEnteNome?: string }): Promise<string | undefined> {
  if (input.enteVarioId) return input.enteVarioId;
  if (input.nuovoEnteNome?.trim()) return (await trovaOCreaEnteVario(input.nuovoEnteNome)).id;
  return undefined;
}
