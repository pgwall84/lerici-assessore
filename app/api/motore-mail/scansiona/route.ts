import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { scansionaMail } from "@/lib/motore-mail";
import { z } from "zod";

const schema = z.object({
  pageToken: z.string().optional(),
  maxResults: z.number().int().min(1).max(100).optional(),
});

// Endpoint di verifica manuale per la Sessione A: esegue una pagina di scan (classificazione
// + log su MailProcessata), nessuna creazione di entità né etichetta Gmail di categoria.
// Va richiamato ripetutamente passando il nextPageToken ricevuto finché non torna undefined,
// per drenare tutto il pregresso senza rischiare di superare i limiti di esecuzione.
export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const risultato = await scansionaMail(parsed.data.pageToken, parsed.data.maxResults);
  return NextResponse.json(risultato);
}
