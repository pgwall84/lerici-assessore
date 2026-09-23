import { prisma } from "@/lib/prisma";

// Materie/uffici fuori dalle deleghe di Marco (2026-09-23): destinazione di sola etichetta Gmail
// "Varie/<nome>", estendibile al volo dalla schermata di revisione — stesso principio di
// trovaOCreaEnteVario/trovaOCreaSottoTema. Confronto case-insensitive per non creare doppioni
// ("Urbanistica"/"urbanistica"), come già per enti (NOTE-TECNICHE #26) e etichette Gmail (#23).
export async function trovaOCreaAltraDelega(nome: string) {
  const nomeTrim = nome.trim().replace(/\s+/g, " ");
  const esistente = await prisma.altraDelega.findFirst({ where: { nome: { equals: nomeTrim, mode: "insensitive" } } });
  if (esistente) return esistente;
  return prisma.altraDelega.create({ data: { nome: nomeTrim } });
}
