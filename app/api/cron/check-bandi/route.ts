import { NextRequest, NextResponse } from "next/server";
import { checkBandi } from "@/lib/bandi";

// Senza questo, la function usa il limite di durata di default della piattaforma (10s) — 5 fonti
// che scrapano siti esterni in sequenza lo superano facilmente (osservato: ANCI Nazionale da sola
// ~13s), la function viene interrotta a metà e le fonti più in fondo alla lista (es. UPEL) non
// vengono mai raggiunte — compresa la segnalazione Telegram di rottura per quella fonte, che quindi
// non parte mai pur essendo implementata correttamente.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { nuovi, errori } = await checkBandi();
  return NextResponse.json({ nuovi, errori });
}
