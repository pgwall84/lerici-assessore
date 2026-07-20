import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  stato: z.enum(["NUOVO", "VALUTATO", "INTERESSANTE", "SCARTATO", "SCADUTO"]).optional(),
  delega: z.enum(["VIABILITA","AMBIENTE","RIFIUTI","SISTEMA_IDRICO","ILLUMINAZIONE","ACCESSIBILITA","CIMITERI","POLITICHE_ABITATIVE","DIGITALIZZAZIONE","MANUTENZIONE_PATRIMONIO"]).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const bando = await prisma.bando.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json(bando);
}
