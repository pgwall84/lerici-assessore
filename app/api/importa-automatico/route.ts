import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { eseguiMotoreMail } from "@/lib/motore-mail";

// Trigger manuale del motore di scansione mail (sezione 6) — bottone "Importa da mail" in
// Attività Politico-Amministrativa. Stessa funzione usata dal cron, solo con auth di sessione
// invece che CRON_SECRET.
export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const risultato = await eseguiMotoreMail();
  return NextResponse.json(risultato);
}
