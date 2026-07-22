import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { esportaTabella } from "@/lib/export-tabella";
import { ordinaPerPriorita } from "@/lib/ordinamento";
import {
  DELEGHE_LABEL, PRIORITA_LABEL, STATO_PROGETTO_LABEL,
  STATI_PROGETTO_OPERATIVA, STATI_PROGETTO_ARCHIVIO,
} from "@/lib/constants";

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const formato = searchParams.get("formato") ?? "xlsx";
  const delega = searchParams.get("delega");
  const stato = searchParams.get("stato");
  const priorita = searchParams.get("priorita");
  const vista = searchParams.get("vista");

  const progetti = await prisma.progetto.findMany({
    where: {
      ...(delega ? { delega: delega as never } : {}),
      ...(priorita ? { priorita: priorita as never } : {}),
      ...(stato
        ? { stato: stato as never }
        : vista === "operativa" ? { stato: { in: STATI_PROGETTO_OPERATIVA as never[] } }
        : vista === "archivio" ? { stato: { in: STATI_PROGETTO_ARCHIVIO as never[] } }
        : {}),
    },
    include: { responsabile: true },
  });

  const ordinati = ordinaPerPriorita(progetti, p => p.priorita, p => p.createdAt);

  const righe = ordinati.map((p, i) => ({
    "#": i + 1,
    "Titolo": p.titolo,
    "Delega": DELEGHE_LABEL[p.delega],
    "Stato": STATO_PROGETTO_LABEL[p.stato],
    "Priorità": p.priorita ? PRIORITA_LABEL[p.priorita] : "",
    "Responsabile": p.responsabile ? `${p.responsabile.nome} ${p.responsabile.cognome}` : "",
    "Fonte finanziamento": p.fonteFinanziamento ?? "",
    "Creato": new Date(p.createdAt).toLocaleDateString("it-IT"),
  }));

  return esportaTabella(formato, righe, {
    titolo: "Progetti",
    nomeFile: "progetti",
    colWidths: [4, 40, 22, 14, 10, 22, 22, 12],
  });
}
