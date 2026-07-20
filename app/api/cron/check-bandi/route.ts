import { NextRequest, NextResponse } from "next/server";
import { checkBandi } from "@/lib/bandi";

// Senza questo, la function usa il limite di durata di default della piattaforma — le fonti
// scrapate in sequenza lo superano facilmente, la function viene interrotta a metà e le fonti più
// in fondo alla lista (es. UPEL) non vengono mai raggiunte — compresa la segnalazione Telegram di
// rottura per quella fonte, che quindi non parte mai pur essendo implementata correttamente.
// 120s: margine ampio (~3x il tempo reale osservato, ~41-45s con l'estrazione via AI) contro la
// latenza di rete variabile delle chiamate Claude, pur restando ben sotto il vero tetto del piano
// Hobby (300s con fluid compute, verificato 2026-07-21 — non 60s come assunto in precedenza: quel
// numero era il limite legacy senza fluid compute, il limite Hobby reale su durata è molto più
// ampio; il vincolo Hobby genuino è sulla *frequenza* dei cron, max 1x/giorno, vedi nota #13).
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { nuovi, errori } = await checkBandi();
  return NextResponse.json({ nuovi, errori });
}
