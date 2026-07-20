import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const stato = searchParams.get("stato");
  const delega = searchParams.get("delega");

  const bandi = await prisma.bando.findMany({
    where: {
      ...(stato ? { stato: stato as never } : {}),
      ...(delega ? { delega: delega as never } : {}),
    },
    orderBy: [
      { stato: "asc" },
      { dataChiusura: "asc" },
      { createdAt: "desc" },
    ],
  });

  return NextResponse.json(bandi);
}
