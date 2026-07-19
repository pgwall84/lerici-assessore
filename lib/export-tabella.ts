import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

// Genera l'export xlsx/pdf per una lista di righe già "appiattite" in colonne con etichetta.
// Riusato da /api/atti/export, /api/progetti/export, /api/riunioni/export — stesso pattern
// già collaudato in /api/export (Segnalazioni/Progetti storico), evita di triplicare il boilerplate.
export function esportaTabella(
  formato: string,
  righe: Record<string, string | number>[],
  opts: { titolo: string; nomeFile: string; colWidths?: number[] }
): NextResponse {
  const headers = righe.length > 0 ? Object.keys(righe[0]) : [];

  if (formato === "xlsx") {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(righe);
    if (opts.colWidths) ws["!cols"] = opts.colWidths.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, opts.titolo.slice(0, 31));
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${opts.nomeFile}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  }

  if (formato === "pdf") {
    const righeHtml = righe.map((r, i) => {
      const vals = Object.values(r).map(v => `<td>${String(v).replace(/</g, "&lt;")}</td>`).join("");
      return `<tr style="background:${i % 2 === 0 ? "#f8fafc" : "#fff"}">${vals}</tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${opts.titolo}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
  h2 { color: #2563eb; margin-bottom: 4px; }
  p { color: #666; margin: 0 0 12px; font-size: 10px; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #2563eb; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
  @media print { button { display: none; } @page { size: landscape; margin: 15mm; } }
</style></head><body>
<h2>Assessore Lerici — ${opts.titolo}</h2>
<p>Esportato il ${new Date().toLocaleDateString("it-IT")} — ${righe.length} elementi</p>
<button onclick="window.print()" style="margin-bottom:12px;padding:6px 16px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px">🖨️ Stampa / Salva PDF</button>
<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>${righeHtml}</tbody></table>
</body></html>`;

    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  return NextResponse.json({ error: "Formato non supportato" }, { status: 400 });
}
