import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  titolo: z.string().min(1),
  descrizione: z.string().optional(),
  luogo: z.string().optional(),
  dataOra: z.string().datetime(),
  praticaId: z.number().int().optional(),
});

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const appuntamenti = await prisma.appuntamento.findMany({
    where: { dataOra: { gte: new Date() } },
    include: { pratica: { select: { id: true, titolo: true, delega: true } } },
    orderBy: { dataOra: "asc" },
    take: 20,
  });

  return NextResponse.json(appuntamenti);
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const appuntamento = await prisma.appuntamento.create({
    data: { ...parsed.data, dataOra: new Date(parsed.data.dataOra) },
  });

  // Sync Google Calendar (fire-and-forget)
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    syncGoogleCalendar(appuntamento).catch(console.error);
  }

  return NextResponse.json(appuntamento, { status: 201 });
}

async function syncGoogleCalendar(appuntamento: { id: number; titolo: string; descrizione?: string | null; luogo?: string | null; dataOra: Date }) {
  const { google } = await import("googleapis");
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });
  const endOra = new Date(appuntamento.dataOra.getTime() + 60 * 60 * 1000);

  const event = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: appuntamento.titolo,
      description: appuntamento.descrizione ?? undefined,
      location: appuntamento.luogo ?? undefined,
      start: { dateTime: appuntamento.dataOra.toISOString() },
      end: { dateTime: endOra.toISOString() },
      colorId: "9", // Mirtillo (blu scuro)
    },
  });

  await prisma.appuntamento.update({
    where: { id: appuntamento.id },
    data: { googleEventId: event.data.id ?? null },
  });
}
