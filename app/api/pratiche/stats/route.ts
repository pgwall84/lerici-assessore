import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

const STATI_OPERATIVA = ["APERTA", "IN_CORSO", "IN_VALUTAZIONE", "PROMOSSA"];
const STATI_ARCHIVIO = ["CHIUSA", "SOSPESA", "ARCHIVIATA"];

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const [operativa, archivio] = await Promise.all([
    prisma.pratica.groupBy({
      by: ["delega"],
      where: { stato: { in: STATI_OPERATIVA as never[] } },
      _count: { id: true },
    }),
    prisma.pratica.groupBy({
      by: ["delega"],
      where: { stato: { in: STATI_ARCHIVIO as never[] } },
      _count: { id: true },
    }),
  ]);

  const toMap = (rows: { delega: string; _count: { id: number } }[]) =>
    Object.fromEntries(rows.map(r => [r.delega, r._count.id]));

  return NextResponse.json({
    operativa: toMap(operativa),
    archivio: toMap(archivio),
  });
}
