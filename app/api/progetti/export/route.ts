import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { esportaTabella } from "@/lib/export-tabella";
import { ordinaPerPriorita } from "@/lib/ordinamento";
import {
  DELEGHE_LABEL, PRIORITA_LABEL, STATO_PROGETTO_LABEL, TIPO_PROGETTO_LABEL, CATEGORIA_VARIA_LABEL,
  STATI_PROGETTO_OPERATIVA, STATI_PROGETTO_ARCHIVIO,
} from "@/lib/constants";

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const formato = searchParams.get("formato") ?? "xlsx";
  const delega = searchParams.get("delega");
  const categoriaVaria = searchParams.get("categoriaVaria");
  const stato = searchParams.get("stato");
  const priorita = searchParams.get("priorita");
  const tipo = searchParams.get("tipo");
  const vista = searchParams.get("vista");

  const progetti = await prisma.progetto.findMany({
    where: {
      ...(delega ? { delega: delega as never } : {}),
      ...(categoriaVaria ? { categoriaVaria: categoriaVaria as never } : {}),
      ...(priorita ? { priorita: priorita as never } : {}),
      ...(tipo ? { tipo: tipo as never } : {}),
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
    "Tipo": TIPO_PROGETTO_LABEL[p.tipo],
    // "Varie" (evolutiva 2026-07-25): un Progetto ha o una vera delega o una categoriaVaria, mai entrambe.
    "Delega": p.delega ? DELEGHE_LABEL[p.delega] : p.categoriaVaria ? `Varie: ${CATEGORIA_VARIA_LABEL[p.categoriaVaria]}` : "",
    "Stato": STATO_PROGETTO_LABEL[p.stato],
    "Priorità": p.priorita ? PRIORITA_LABEL[p.priorita] : "",
    "Responsabile": p.responsabile ? `${p.responsabile.nome} ${p.responsabile.cognome}` : "",
    "Fonte finanziamento": p.fonteFinanziamento ?? "",
    "Creato": new Date(p.createdAt).toLocaleDateString("it-IT"),
  }));

  return esportaTabella(formato, righe, {
    titolo: "Progetti",
    nomeFile: "progetti",
    colWidths: [4, 40, 12, 22, 14, 10, 22, 22, 12],
  });
}
