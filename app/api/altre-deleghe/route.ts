import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

// Elenco delle "Altre deleghe" (mail fuori dalle deleghe di Marco) per il selettore in revisione mail.
export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  return NextResponse.json(await prisma.altraDelega.findMany({ orderBy: { nome: "asc" } }));
}
