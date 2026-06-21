import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const appuntamento = await prisma.appuntamento.findUnique({ where: { id: Number(id) } });
  if (!appuntamento) return NextResponse.json({ error: "Non trovato" }, { status: 404 });

  // Elimina da Google Calendar se sincronizzato
  if (appuntamento.googleEventId && process.env.GOOGLE_REFRESH_TOKEN) {
    try {
      const { google } = await import("googleapis");
      const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
      oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
      const calendar = google.calendar({ version: "v3", auth: oauth2 });
      await calendar.events.delete({ calendarId: "primary", eventId: appuntamento.googleEventId });
    } catch (e) {
      console.error("Errore eliminazione Google Calendar:", e);
    }
  }

  await prisma.appuntamento.delete({ where: { id: Number(id) } });
  return new NextResponse(null, { status: 204 });
}
