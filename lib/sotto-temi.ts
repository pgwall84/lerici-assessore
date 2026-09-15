import { prisma } from "@/lib/prisma";
import type { Delega } from "@prisma/client";

// Trova o crea un SottoTema per delega+nome esatto (Fase 2, 2026-09-15) — stesso principio di
// trovaOCreaEnteVario/Gestore: non deve servire una migration per aggiungerne uno nuovo, nasce al
// volo la prima volta che Marco lo digita nel form.
export async function trovaOCreaSottoTema(delega: Delega, nome: string) {
  const nomeTrim = nome.trim();
  return prisma.sottoTema.upsert({
    where: { delega_nome: { delega, nome: nomeTrim } },
    update: {},
    create: { delega, nome: nomeTrim },
  });
}

// Risolve l'id SottoTema da usare su una Pratica, dato quanto arriva dal client: un id esistente
// (scelto da una lista già caricata) oppure un nome nuovo da creare al volo — mai entrambi, l'id
// esistente vince. Richiede la delega (un SottoTema è sempre legato a una) solo per il ramo di
// creazione: se arriva solo nuovoSottoTemaNome senza delega, non c'è modo di crearlo.
export async function risolviSottoTemaId(input: { sottoTemaId?: string; nuovoSottoTemaNome?: string; delega?: Delega }): Promise<string | undefined> {
  if (input.sottoTemaId) return input.sottoTemaId;
  if (input.nuovoSottoTemaNome?.trim() && input.delega) return (await trovaOCreaSottoTema(input.delega, input.nuovoSottoTemaNome)).id;
  return undefined;
}
