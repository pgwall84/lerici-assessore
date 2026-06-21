import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { DELEGHE_LABEL, STATO_LABEL, TIPO_LABEL } from "@/lib/constants";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";

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
      ...(tipo ? { tipo: tipo as never } : {}),
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
    "Priorità": p.priorita === "URGENTE" ? "Urgente" : "Normale",
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
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape" });
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    await new Promise<void>(resolve => {
      doc.on("end", resolve);

      // Titolo
      doc.fontSize(14).font("Helvetica-Bold").text("Assessore Lerici — Pratiche", { align: "center" });
      doc.fontSize(9).font("Helvetica").text(`Esportato il ${new Date().toLocaleDateString("it-IT")}`, { align: "center" });
      doc.moveDown(0.5);

      // Intestazioni tabella
      const colX = [30, 55, 100, 175, 350, 420, 470, 530, 620, 700];
      const headers = ["#", "Tipo", "Delega", "Titolo", "Stato", "Priorità", "Luogo", "Referente", "Segnalante", "Data"];
      const colW =  [22, 42, 72, 172, 67, 47, 57, 87, 87, 60];

      const drawRow = (cols: string[], y: number, bold = false) => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(7);
        cols.forEach((text, i) => {
          doc.text(text, colX[i], y, { width: colW[i], lineBreak: false, ellipsis: true });
        });
      };

      let y = doc.y + 5;

      // Header row
      doc.rect(28, y - 2, 784, 14).fill("#2563eb");
      doc.fillColor("white");
      drawRow(headers, y, true);
      doc.fillColor("black");
      y += 16;

      // Data rows
      righe.forEach((r, idx) => {
        if (y > 550) {
          doc.addPage({ margin: 30, size: "A4", layout: "landscape" });
          y = 30;
        }
        if (idx % 2 === 0) doc.rect(28, y - 2, 784, 13).fill("#f1f5f9").stroke("#f1f5f9");
        doc.fillColor("black");
        drawRow(Object.values(r).map(String), y);
        y += 14;
      });

      doc.end();
    });

    const pdf = Buffer.concat(chunks);
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="pratiche-${new Date().toISOString().slice(0,10)}.pdf"`,
      },
    });
  }

  return NextResponse.json({ error: "Formato non supportato" }, { status: 400 });
}
