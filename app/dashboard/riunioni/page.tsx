"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  STATO_RIUNIONE_LABEL, STATO_RIUNIONE_COLORE,
  STATI_RIUNIONE_OPERATIVA, STATI_RIUNIONE_ARCHIVIO,
} from "@/lib/constants";
import { ordinaPerPriorita } from "@/lib/ordinamento";
import { PrioritaBadge, PrioritaDot } from "@/components/PrioritaBadge";
import type { ArgomentoRiunione, Priorita, Riunione, StatoRiunione } from "@prisma/client";

type RiunioneCard = Riunione & {
  persona: { nome: string; cognome: string } | null;
  progetto: { titolo: string } | null;
  argomenti: ArgomentoRiunione[];
};

export default function RiunioniPage() {
  const [riunioni, setRiunioni] = useState<RiunioneCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<"operativa" | "archivio">("operativa");
  const [filtroStato, setFiltroStato] = useState<StatoRiunione | "">("");
  const [filtroPriorita, setFiltroPriorita] = useState<Priorita | "">("");
  const [vistaCompatta, setVistaCompatta] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("vistaCompattaRiunioni") === "1";
    return false;
  });

  function toggleVista() {
    setVistaCompatta(v => { localStorage.setItem("vistaCompattaRiunioni", v ? "0" : "1"); return !v; });
  }

  useEffect(() => {
    fetch("/api/riunioni")
      .then(r => r.json())
      .then(data => { setRiunioni(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const statiDelVista = vista === "operativa" ? STATI_RIUNIONE_OPERATIVA : STATI_RIUNIONE_ARCHIVIO;

  const riunioniVista = useMemo(
    () => riunioni.filter(r => statiDelVista.includes(r.stato)),
    [riunioni, statiDelVista]
  );

  const totaleOperativa = riunioni.filter(r => STATI_RIUNIONE_OPERATIVA.includes(r.stato)).length;
  const totaleArchivio = riunioni.filter(r => STATI_RIUNIONE_ARCHIVIO.includes(r.stato)).length;

  const riunioniFiltrate = useMemo(() => {
    const filtrate = riunioniVista.filter(r =>
      (!filtroStato || r.stato === filtroStato) &&
      (!filtroPriorita || r.priorita === filtroPriorita)
    );
    return ordinaPerPriorita(filtrate, r => r.priorita, r => r.createdAt);
  }, [riunioniVista, filtroStato, filtroPriorita]);

  function esporta(formato: "xlsx" | "pdf") {
    const params = new URLSearchParams({ vista, formato });
    if (filtroStato) params.set("stato", filtroStato);
    if (filtroPriorita) params.set("priorita", filtroPriorita);
    window.open(`/api/riunioni/export?${params}`, "_blank");
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">🎙️ Riunioni</h1>
        <Link
          href="/dashboard/riunioni/nuova"
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
        >
          + Nuova
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

      {/* Filtri */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={filtroStato}
            onChange={e => setFiltroStato(e.target.value as StatoRiunione | "")}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
          >
            <option value="">Tutti gli stati</option>
            {statiDelVista.map(s => (
              <option key={s} value={s}>{STATO_RIUNIONE_LABEL[s]}</option>
            ))}
          </select>
          <select
            value={filtroPriorita}
            onChange={e => setFiltroPriorita(e.target.value as Priorita | "")}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
          >
            <option value="">Tutte le priorità</option>
            <option value="ALTA">Alta</option>
            <option value="MEDIA">Media</option>
            <option value="BASSA">Bassa</option>
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

      {loading ? (
        <div className="text-center py-16 text-gray-400">Caricamento…</div>
      ) : riunioniFiltrate.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🎙️</p>
          <p>Nessuna riunione trovata</p>
        </div>
      ) : vistaCompatta ? (
        <div className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {riunioniFiltrate.map(r => {
            const trattati = r.argomenti.filter(a => a.spuntato).length;
            return (
              <Link
                key={r.id}
                href={r.stato === "IN_PREPARAZIONE" ? `/dashboard/riunioni/${r.id}/revisione` : `/dashboard/riunioni/${r.id}`}
                className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 transition-colors"
              >
                <PrioritaDot priorita={r.priorita} />
                <span className="font-medium text-gray-900 text-sm truncate flex-1">{r.titolo}</span>
                {r.argomenti.length > 0 && (
                  <span className="text-xs text-gray-400 shrink-0">{trattati}/{r.argomenti.length}</span>
                )}
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${STATO_RIUNIONE_COLORE[r.stato]}`}>
                  {STATO_RIUNIONE_LABEL[r.stato]}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {riunioniFiltrate.map(r => {
            const trattati = r.argomenti.filter(a => a.spuntato).length;
            return (
              <Link
                key={r.id}
                href={r.stato === "IN_PREPARAZIONE" ? `/dashboard/riunioni/${r.id}/revisione` : `/dashboard/riunioni/${r.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_RIUNIONE_COLORE[r.stato]}`}>
                    {STATO_RIUNIONE_LABEL[r.stato]}
                  </span>
                  <PrioritaBadge priorita={r.priorita} />
                </div>
                <p className="text-sm font-medium text-gray-900 leading-snug">{r.titolo}</p>
                <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                  {r.persona && <span>👤 {r.persona.nome} {r.persona.cognome}</span>}
                  {r.progetto && <span>📁 {r.progetto.titolo}</span>}
                  {r.argomenti.length > 0 && <span>{trattati}/{r.argomenti.length} trattati</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
