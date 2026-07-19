import type { Priorita } from "@prisma/client";

// Priorità non specificata (null/undefined) va trattata come più bassa di BASSA,
// non come se fosse ALTA — altrimenti finisce (erroneamente) in cima alle liste.
const ORDINE_PRIORITA: Record<Priorita, number> = { ALTA: 0, MEDIA: 1, BASSA: 2 };
const ORDINE_NON_SPECIFICATA = 3;

export function confrontaPriorita(a: Priorita | null | undefined, b: Priorita | null | undefined): number {
  const va = a ? ORDINE_PRIORITA[a] : ORDINE_NON_SPECIFICATA;
  const vb = b ? ORDINE_PRIORITA[b] : ORDINE_NON_SPECIFICATA;
  return va - vb;
}

// Ordina per priorità (non specificata = più bassa di tutte), con fallback
// all'ordine cronologico di inserimento (createdAt asc) a parità di priorità.
export function ordinaPerPriorita<T>(
  items: T[],
  getPriorita: (item: T) => Priorita | null | undefined,
  getCreatedAt: (item: T) => Date | string
): T[] {
  return [...items].sort((a, b) => {
    const diff = confrontaPriorita(getPriorita(a), getPriorita(b));
    if (diff !== 0) return diff;
    return new Date(getCreatedAt(a)).getTime() - new Date(getCreatedAt(b)).getTime();
  });
}
