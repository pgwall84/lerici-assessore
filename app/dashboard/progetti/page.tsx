"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DELEGHE_LABEL } from "@/lib/constants";
import type { Delega, DocumentoProgetto, NotaProgetto, Progetto, StatoProgetto } from "@prisma/client";

const STATO_LABEL: Record<StatoProgetto, string> = {
  IN_CORSO: "In corso",
  SOSPESO: "Sospeso",
  CONCLUSO: "Concluso",
  ARCHIVIATO: "Archiviato",
};

const STATO_COLORE: Record<StatoProgetto, string> = {
  IN_CORSO: "bg-yellow-100 text-yellow-800",
  SOSPESO: "bg-gray-100 text-gray-600",
  CONCLUSO: "bg-green-100 text-green-800",
  ARCHIVIATO: "bg-gray-100 text-gray-500",
};

const STATI: StatoProgetto[] = ["IN_CORSO", "SOSPESO", "CONCLUSO", "ARCHIVIATO"];

type ProgettoCard = Progetto & {
  responsabile: { nome: string; cognome: string } | null;
  note: NotaProgetto[];
  documenti: DocumentoProgetto[];
};

export default function ProgettiPage() {
  const [progetti, setProgetti] = useState<ProgettoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStato, setFiltroStato] = useState<StatoProgetto | "">("IN_CORSO");
  const [filtroDelega, setFiltroDelega] = useState<Delega | "">("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (filtroStato) params.set("stato", filtroStato);
    if (filtroDelega) params.set("delega", filtroDelega);
    setLoading(true);
    fetch(`/api/progetti?${params}`)
      .then(r => r.json())
      .then(data => { setProgetti(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filtroStato, filtroDelega]);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">📁 Progetti</h1>
        <Link
          href="/dashboard/progetti/nuovo"
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
        >
          + Nuovo
        </Link>
      </div>

      {/* Filtri */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={filtroStato}
          onChange={e => setFiltroStato(e.target.value as StatoProgetto | "")}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tutti gli stati</option>
          {STATI.map(s => <option key={s} value={s}>{STATO_LABEL[s]}</option>)}
        </select>
        <select
          value={filtroDelega}
          onChange={e => setFiltroDelega(e.target.value as Delega | "")}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tutte le deleghe</option>
          {(Object.keys(DELEGHE_LABEL) as Delega[]).map(d => (
            <option key={d} value={d}>{DELEGHE_LABEL[d]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Caricamento…</div>
      ) : progetti.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📁</p>
          <p>Nessun progetto trovato</p>
        </div>
      ) : (
        <div className="space-y-3">
          {progetti.map(p => (
            <Link
              key={p.id}
              href={`/dashboard/progetti/${p.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_COLORE[p.stato]}`}>
                  {STATO_LABEL[p.stato]}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {DELEGHE_LABEL[p.delega]}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-900 leading-snug">{p.titolo}</p>
              {p.responsabile && (
                <p className="text-xs text-gray-500 mt-0.5">👤 {p.responsabile.nome} {p.responsabile.cognome}</p>
              )}
              <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                {p.documenti.length > 0 && <span>📎 {p.documenti.length}</span>}
                {p.note[0] && <span className="truncate">📝 {p.note[0].testo.slice(0, 60)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
