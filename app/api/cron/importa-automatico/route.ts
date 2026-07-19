import { NextRequest, NextResponse } from "next/server";
import { eseguiImportazioneAutomatica } from "@/lib/import-automatico";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const risultato = await eseguiImportazioneAutomatica();
  return NextResponse.json(risultato);
}
