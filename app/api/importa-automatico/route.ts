import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { eseguiImportazioneAutomatica } from "@/lib/import-automatico";

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const risultato = await eseguiImportazioneAutomatica();
  return NextResponse.json(risultato);
}
