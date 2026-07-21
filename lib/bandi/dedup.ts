import { createHash } from "crypto";
import type { BandoRaw } from "./fonti/types";

// bandoUrl è il link alla pagina specifica di QUEL bando sulla fonte — stabile nel tempo, a
// differenza di titolo e dataChiusura: dopo la conversione a estrazione via AI
// (lib/bandi/estrazione-ai.ts) entrambi sono scritti da un LLM, il cui wording/parsing può variare
// leggermente run su run anche per lo stesso identico bando. Usarli nella chiave romperebbe la
// dedup con un cron permanente 3x/settimana: stesso bando rilevato come "nuovo" a ogni piccola
// variazione, duplicati in DB e notifiche Telegram ripetute.
// Fallback su titolo+fonteUrl solo per il raro caso in cui una fonte non fornisce un bandoUrl
// (es. x-desk se manca sia il link che il testo nella cella) — qui il titolo resta comunque un
// segnale debole, ma è l'unico disponibile in quel caso limite.
export function calcolaHash(b: BandoRaw): string {
  const chiave = b.bandoUrl?.trim() || `${b.titolo.trim().toLowerCase()}|${b.fonteUrl}`;
  return createHash("sha256").update(chiave).digest("hex");
}
