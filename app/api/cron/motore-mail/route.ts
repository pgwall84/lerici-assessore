import { NextRequest, NextResponse } from "next/server";
import { eseguiMotoreMail } from "@/lib/motore-mail";

// Cron del motore di scansione mail (sezione 6): sostituisce il vecchio cron
// /api/cron/importa-automatico, disattivato nello stesso deploy in cui questo entra in vercel.json.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const risultato = await eseguiMotoreMail();
  return NextResponse.json(risultato);
}
