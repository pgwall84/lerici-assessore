import { createHash } from "crypto";
import type { BandoRaw } from "./fonti/types";

export function calcolaHash(b: BandoRaw): string {
  const chiave = [
    b.titolo.trim().toLowerCase(),
    b.fonteUrl,
    b.dataChiusura?.toISOString() ?? "",
  ].join("|");
  return createHash("sha256").update(chiave).digest("hex");
}
