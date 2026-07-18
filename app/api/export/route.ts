import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { DELEGHE_LABEL, STATO_LABEL, TIPO_LABEL } from "@/lib/constants";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const formato = searchParams.get("formato") ?? "xlsx";
  const tipo = searchParams.get("tipo");
  const delega = searchParams.get("delega");
  const stato = searchParams.get("stato");
  const q = searchParams.get("q");

  const pratiche = await prisma.pratica.findMany({
    where: {
      ...(tipo ? { tipo: tipo as never } : { tipo: { not: "PROGETTO" as never } }),
      ...(delega ? { delega: delega as never } : {}),
      ...(stato ? { stato: stato as never } : { stato: { not: "ARCHIVIATA" as never } }),
      ...(q ? { OR: [
        { titolo: { contains: q, mode: "insensitive" } },
        { descrizione: { contains: q, mode: "insensitive" } },
      ]} : {}),
    },
    include: { persona: true, segnalante: true },
    orderBy: [{ priorita: "desc" }, { updatedAt: "desc" }],
  });

  const righe = pratiche.map((p, i) => ({
    "#": i + 1,
    "Tipo": TIPO_LABEL[p.tipo as keyof typeof TIPO_LABEL],
    "Delega": DELEGHE_LABEL[p.delega as keyof typeof DELEGHE_LABEL],
    "Titolo": p.titolo,
    "Stato": STATO_LABEL[p.stato as keyof typeof STATO_LABEL],
    "Priorità": ({ ALTA: "Alta", MEDIA: "Media", BASSA: "Bassa" } as Record<string, string>)[p.priorita] ?? p.priorita,
    "Luogo": p.luogo ?? "",
    "Referente": p.persona ? `${p.persona.nome} ${p.persona.cognome}` : "",
    "Segnalante": p.segnalante?.nome ?? "",
    "Data": new Date(p.createdAt).toLocaleDateString("it-IT"),
  }));

  if (formato === "xlsx") {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(righe);

    // Larghezze colonne
    ws["!cols"] = [
      { wch: 4 }, { wch: 18 }, { wch: 22 }, { wch: 40 },
      { wch: 16 }, { wch: 10 }, { wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Pratiche");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="pratiche-${new Date().toISOString().slice(0,10)}.xlsx"`,
      },
    });
  }

  if (formato === "pdf") {
    const headers = ["#", "Tipo", "Delega", "Titolo", "Stato", "Priorità", "Luogo", "Referente", "Segnalante", "Data"];
    const righeHtml = righe.map((r, i) => {
      const vals = Object.values(r).map(v => `<td>${String(v).replace(/</g, "&lt;")}</td>`).join("");
      return `<tr style="background:${i % 2 === 0 ? "#f8fafc" : "#fff"}">${vals}</tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Pratiche Lerici</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
  h2 { color: #2563eb; margin-bottom: 4px; }
  p { color: #666; margin: 0 0 12px; font-size: 10px; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #2563eb; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
  @media print { button { display: none; } @page { size: landscape; margin: 15mm; } }
</style></head><body>
<h2>Assessore Lerici — Pratiche</h2>
<p>Esportato il ${new Date().toLocaleDateString("it-IT")} — ${righe.length} pratiche</p>
<button onclick="window.print()" style="margin-bottom:12px;padding:6px 16px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px">🖨️ Stampa / Salva PDF</button>
<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>${righeHtml}</tbody></table>
</body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.json({ error: "Formato non supportato" }, { status: 400 });
}
