import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  stato: z.enum(["APERTA","IN_CORSO","CHIUSA","SOSPESA","APPUNTO","IN_VALUTAZIONE","PROMOSSA","ARCHIVIATA"]).optional(),
  priorita: z.enum(["BASSA","MEDIA","ALTA"]).optional(),
  // PROGETTO deliberatamente escluso: un Progetto vive nel modello Progetto dedicato, non come
  // Pratica con questo tipo — quel valore esisteva solo per compatibilità con un vecchio flusso
  // di importazione mail ormai rimosso, e permetteva di trasformare in silenzio una Pratica
  // (Segnalazione/Idea) in una riga invisibile in ogni vista, senza mai creare un vero Progetto.
  tipo: z.enum(["SEGNALAZIONE","MIA_IDEA"]).optional(),
  titolo: z.string().min(1).max(200).optional(),
  descrizione: z.string().nullable().optional(),
  luogo: z.string().nullable().optional(),
  delega: z.enum(["VIABILITA","AMBIENTE","RIFIUTI","SISTEMA_IDRICO","ILLUMINAZIONE","ACCESSIBILITA","CIMITERI","POLITICHE_ABITATIVE","DIGITALIZZAZIONE","MANUTENZIONE_PATRIMONIO"]).optional(),
  personaId: z.number().int().nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const pratica = await prisma.pratica.findUnique({
    where: { id: Number(id) },
    include: {
      persona: true,
      segnalante: true,
      foto: true,
      note: { orderBy: { createdAt: "asc" } },
      storico: { orderBy: { createdAt: "asc" } },
      appuntamenti: { orderBy: { dataOra: "asc" } },
      mailInviate: { orderBy: { sentAt: "desc" } },
    },
  });

  if (!pratica) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  return NextResponse.json(pratica);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.pratica.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  const { stato, ...rest } = parsed.data;

  const pratica = await prisma.pratica.update({
    where: { id: Number(id) },
    data: {
      ...rest,
      ...(stato ? { stato } : {}),
      ...(stato === "CHIUSA" && existing.stato !== "CHIUSA" ? { chiusaAt: new Date() } : {}),
      ...(stato && stato !== existing.stato ? {
        storico: {
          create: { statoPrecedente: existing.stato, statoNuovo: stato },
        },
      } : {}),
    },
    include: { persona: true, segnalante: true },
  });

  // Quando si chiude una pratica importata da mail, spostala in Segnalazioni/Chiusa
  if (stato === "CHIUSA" && existing.stato !== "CHIUSA" && existing.messageId) {
    try {
      const { spostaInChiusa } = await import("@/lib/gmail");
      await spostaInChiusa(existing.messageId);
    } catch { /* ignora errori Gmail — la pratica è già chiusa */ }
  }

  return NextResponse.json(pratica);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const pratica = await prisma.pratica.findUnique({ where: { id: Number(id) }, select: { messageId: true } });

  await prisma.pratica.delete({ where: { id: Number(id) } });

  // Rimuovi etichetta "Importata" da Gmail se la pratica viene da una mail
  if (pratica?.messageId) {
    try {
      const { rimuoviImportata } = await import("@/lib/gmail");
      await rimuoviImportata(pratica.messageId);
    } catch { /* ignora errori Gmail */ }
  }

  return new NextResponse(null, { status: 204 });
}
