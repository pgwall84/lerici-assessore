import { PRIORITA_COLORE, PRIORITA_LABEL } from "@/lib/constants";
import type { Priorita } from "@prisma/client";

// Pillola colorata — usata nelle viste normali (non compatte). Nulla se non specificata:
// "non specificata" non è un'informazione utile da mostrare come badge.
export function PrioritaBadge({ priorita }: { priorita: Priorita | null }) {
  if (!priorita) return null;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITA_COLORE[priorita]}`}>
      {PRIORITA_LABEL[priorita]}
    </span>
  );
}

// Pallino compatto — solo per ALTA, per non affollare la vista compatta.
export function PrioritaDot({ priorita }: { priorita: Priorita | null }) {
  if (priorita !== "ALTA") return null;
  return <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" />;
}
