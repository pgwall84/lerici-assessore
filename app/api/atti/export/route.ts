import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { esportaTabella } from "@/lib/export-tabella";
import { ordinaPerPriorita } from "@/lib/ordinamento";
import {
  PRIORITA_LABEL, STATO_ATTO_LABEL, TIPO_ATTO_LABEL,
  STATI_ATTO_OPERATIVA, STATI_ATTO_ARCHIVIO,
} from "@/lib/constants";

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const formato = searchParams.get("formato") ?? "xlsx";
  const tipo = searchParams.get("tipo");
  const stato = searchParams.get("stato");
  const priorita = searchParams.get("priorita");
  const vista = searchParams.get("vista");

  const atti = await prisma.attoPoliticoAmministrativo.findMany({
    where: {
      ...(tipo ? { tipo: tipo as never } : {}),
      ...(priorita ? { priorita: priorita as never } : {}),
      ...(stato
        ? { stato: stato as never }
        : vista === "operativa" ? { stato: { in: STATI_ATTO_OPERATIVA as never[] } }
        : vista === "archivio" ? { stato: { in: STATI_ATTO_ARCHIVIO as never[] } }
        : {}),
    },
  });

  const ordinati = ordinaPerPriorita(atti, a => a.priorita, a => a.createdAt);

  const righe = ordinati.map((a, i) => ({
    "#": i + 1,
    "Tipo": TIPO_ATTO_LABEL[a.tipo],
    "Oggetto": a.oggetto,
    "Stato": STATO_ATTO_LABEL[a.stato],
    "Priorità": a.priorita ? PRIORITA_LABEL[a.priorita] : "",
    "Data seduta": a.dataSeduta ? new Date(a.dataSeduta).toLocaleDateString("it-IT") : "",
    "Scadenza risposta": a.scadenzaRisposta ? new Date(a.scadenzaRisposta).toLocaleDateString("it-IT") : "",
    "Creato": new Date(a.createdAt).toLocaleDateString("it-IT"),
  }));

  return esportaTabella(formato, righe, {
    titolo: "Attività Politico-Amministrativa",
    nomeFile: "atti",
    colWidths: [4, 22, 40, 16, 10, 14, 16, 12],
  });
}
