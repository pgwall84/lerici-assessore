"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  DELEGHE_LABEL, STATO_PROGETTO_LABEL, STATO_PROGETTO_COLORE,
  STATI_PROGETTO_OPERATIVA, STATI_PROGETTO_ARCHIVIO,
} from "@/lib/constants";
import type { Delega, DocumentoProgetto, NotaProgetto, Progetto, StatoProgetto } from "@prisma/client";

const STATO_LABEL = STATO_PROGETTO_LABEL;
const STATO_COLORE = STATO_PROGETTO_COLORE;
const STATI_OPERATIVA = STATI_PROGETTO_OPERATIVA;
const STATI_ARCHIVIO = STATI_PROGETTO_ARCHIVIO;

type ProgettoCard = Progetto & {
  responsabile: { nome: string; cognome: string } | null;
  note: NotaProgetto[];
  documenti: DocumentoProgetto[];
};

export default function ProgettiPage() {
  const [progetti, setProgetti] = useState<ProgettoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<"operativa" | "archivio">("operativa");
  const [filtroDelega, setFiltroDelega] = useState<Delega | "">("");
  const [filtroStato, setFiltroStato] = useState<StatoProgetto | "">("");
  const [vistaCompatta, setVistaCompatta] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("vistaCompattaProgetti") === "1";
    return false;
  });

  function toggleVista() {
    setVistaCompatta(v => { localStorage.setItem("vistaCompattaProgetti", v ? "0" : "1"); return !v; });
  }

  useEffect(() => {
    fetch("/api/progetti")
      .then(r => r.json())
      .then(data => { setProgetti(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const statiDelVista = vista === "operativa" ? STATI_OPERATIVA : STATI_ARCHIVIO;

  const progettiVista = useMemo(
    () => progetti.filter(p => statiDelVista.includes(p.stato)),
    [progetti, statiDelVista]
  );

  const statVista = useMemo(() => {
    const conteggi: Partial<Record<Delega, number>> = {};
    for (const p of progettiVista) conteggi[p.delega] = (conteggi[p.delega] ?? 0) + 1;
    return conteggi;
  }, [progettiVista]);

  const totaleVista = progettiVista.length;
  const totaleOperativa = progetti.filter(p => STATI_OPERATIVA.includes(p.stato)).length;
  const totaleArchivio = progetti.filter(p => STATI_ARCHIVIO.includes(p.stato)).length;

  const progettiFiltrati = progettiVista.filter(p =>
    (!filtroDelega || p.delega === filtroDelega) &&
    (!filtroStato || p.stato === filtroStato)
  );

  function esporta(formato: "xlsx" | "pdf") {
    const params = new URLSearchParams({ vista, formato });
    if (filtroDelega) params.set("delega", filtroDelega);
    if (filtroStato) params.set("stato", filtroStato);
    window.open(`/api/progetti/export?${params}`, "_blank");
  }

  return (
    <div className="flex gap-0 md:gap-5 pb-32">

      {/* Sidebar deleghe — desktop */}
      <aside className="hidden md:flex flex-col gap-0.5 w-44 shrink-0 pt-1">
        <button
          onClick={() => setFiltroDelega("")}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex justify-between items-center
            ${filtroDelega === "" ? "bg-blue-600 text-white font-semibold" : "text-gray-700 hover:bg-gray-100"}`}
        >
          <span>Tutte</span>
          <span className={`text-xs font-mono ${filtroDelega === "" ? "text-blue-100" : "text-gray-400"}`}>
            {totaleVista}
          </span>
        </button>
        {(Object.keys(DELEGHE_LABEL) as Delega[]).map(d => {
          const n = statVista[d] ?? 0;
          const attiva = filtroDelega === d;
          return (
            <button
              key={d}
              onClick={() => setFiltroDelega(d === filtroDelega ? "" : d)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex justify-between items-center gap-1
                ${attiva ? "bg-blue-600 text-white font-semibold" : n === 0 ? "text-gray-300 hover:bg-gray-50" : "text-gray-700 hover:bg-gray-100"}`}
            >
              <span className="truncate leading-tight">{DELEGHE_LABEL[d]}</span>
              {n > 0 && (
                <span className={`text-xs font-mono shrink-0 ${attiva ? "text-blue-100" : "text-gray-400"}`}>{n}</span>
              )}
            </button>
          );
        })}
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">📁 Progetti</h1>
          <Link
            href="/dashboard/progetti/nuovo"
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
          >
            + Nuovo
          </Link>
        </div>

        {/* Tab Operativa / Archivio */}
        <div className="flex gap-2">
          <button
            onClick={() => { setVista("operativa"); setFiltroStato(""); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors
              ${vista === "operativa" ? "bg-blue-600 text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            ⚡ Operativa
            <span className={`ml-2 text-xs font-mono ${vista === "operativa" ? "text-blue-200" : "text-gray-400"}`}>
              {totaleOperativa}
            </span>
          </button>
          <button
            onClick={() => { setVista("archivio"); setFiltroStato(""); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors
              ${vista === "archivio" ? "bg-gray-700 text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            📁 Archivio
            <span className={`ml-2 text-xs font-mono ${vista === "archivio" ? "text-gray-300" : "text-gray-400"}`}>
              {totaleArchivio}
            </span>
          </button>
        </div>

        {/* Deleghe mobile (scroll orizzontale) */}
        <div className="md:hidden flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          <button
            onClick={() => setFiltroDelega("")}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors
              ${filtroDelega === "" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"}`}
          >
            Tutte {totaleVista > 0 && <span className="ml-1 opacity-70">{totaleVista}</span>}
          </button>
          {(Object.keys(DELEGHE_LABEL) as Delega[]).map(d => {
            const n = statVista[d] ?? 0;
            if (n === 0 && filtroDelega !== d) return null;
            return (
              <button
                key={d}
                onClick={() => setFiltroDelega(d === filtroDelega ? "" : d)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors
                  ${filtroDelega === d ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"}`}
              >
                {DELEGHE_LABEL[d]} {n > 0 && <span className="ml-1 opacity-70">{n}</span>}
              </button>
            );
          })}
        </div>

        {/* Filtri */}
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={filtroStato}
              onChange={e => setFiltroStato(e.target.value as StatoProgetto | "")}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
            >
              <option value="">Tutti gli stati</option>
              {statiDelVista.map(s => (
                <option key={s} value={s}>{STATO_LABEL[s]}</option>
              ))}
            </select>
            <div className="ml-auto flex gap-1.5">
              <button onClick={toggleVista} className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${vistaCompatta ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                ☰
              </button>
              <button onClick={() => esporta("xlsx")} className="text-xs px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100">
                📊
              </button>
              <button onClick={() => esporta("pdf")} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">
                📄
              </button>
            </div>
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Caricamento…</div>
        ) : progettiFiltrati.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📁</p>
            <p>Nessun progetto trovato</p>
          </div>
        ) : vistaCompatta ? (
          <div className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-200 overflow-hidden">
            {progettiFiltrati.map(p => (
              <Link
                key={p.id}
                href={`/dashboard/progetti/${p.id}`}
                className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 transition-colors"
              >
                <span className="font-medium text-gray-900 text-sm truncate flex-1">{p.titolo}</span>
                <span className="text-xs text-gray-400 truncate hidden sm:block max-w-xs shrink-0">
                  {DELEGHE_LABEL[p.delega]}
                </span>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${STATO_COLORE[p.stato]}`}>
                  {STATO_LABEL[p.stato]}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {progettiFiltrati.map(p => (
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
    </div>
  );
}
