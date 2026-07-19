import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { esportaTabella } from "@/lib/export-tabella";
import { ordinaPerPriorita } from "@/lib/ordinamento";
import {
  PRIORITA_LABEL, STATO_RIUNIONE_LABEL,
  STATI_RIUNIONE_OPERATIVA, STATI_RIUNIONE_ARCHIVIO,
} from "@/lib/constants";

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const formato = searchParams.get("formato") ?? "xlsx";
  const stato = searchParams.get("stato");
  const priorita = searchParams.get("priorita");
  const vista = searchParams.get("vista");

  const riunioni = await prisma.riunione.findMany({
    where: {
      ...(priorita ? { priorita: priorita as never } : {}),
      ...(stato
        ? { stato: stato as never }
        : vista === "operativa" ? { stato: { in: STATI_RIUNIONE_OPERATIVA as never[] } }
        : vista === "archivio" ? { stato: { in: STATI_RIUNIONE_ARCHIVIO as never[] } }
        : {}),
    },
    include: { persona: true, progetto: true, argomenti: true },
  });

  const ordinate = ordinaPerPriorita(riunioni, r => r.priorita, r => r.createdAt);

  const righe = ordinate.map((r, i) => ({
    "#": i + 1,
    "Titolo": r.titolo,
    "Stato": STATO_RIUNIONE_LABEL[r.stato],
    "Priorità": r.priorita ? PRIORITA_LABEL[r.priorita] : "",
    "Persona": r.persona ? `${r.persona.nome} ${r.persona.cognome}` : "",
    "Progetto": r.progetto?.titolo ?? "",
    "Argomenti trattati": `${r.argomenti.filter(a => a.spuntato).length}/${r.argomenti.length}`,
    "Data": r.dataOra ? new Date(r.dataOra).toLocaleDateString("it-IT") : "",
    "Creata": new Date(r.createdAt).toLocaleDateString("it-IT"),
  }));

  return esportaTabella(formato, righe, {
    titolo: "Riunioni",
    nomeFile: "riunioni",
    colWidths: [4, 30, 14, 10, 20, 20, 16, 12, 12],
  });
}
