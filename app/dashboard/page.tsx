"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  DELEGHE_LABEL, STATO_COLORE, STATO_LABEL, TIPO_COLORE, TIPO_LABEL,
  PRIORITA_LABEL, PRIORITA_COLORE, STATI_OPERATIVA, STATI_ARCHIVIO,
} from "@/lib/constants";
import { ordinaPerPriorita } from "@/lib/ordinamento";
import type { Delega, Pratica, Priorita, StatoPratica, TipoPratica } from "@prisma/client";

type PraticaCard = Pratica & {
  persona: { nome: string; cognome: string } | null;
  segnalante: { nome: string | null } | null;
  foto: { id: number; path: string }[];
  note: { testo: string; createdAt: string }[];
};

type Stats = { operativa: Record<string, number>; archivio: Record<string, number> };

export default function DashboardPage() {
  const [pratiche, setPratiche] = useState<PraticaCard[]>([]);
  const [stats, setStats] = useState<Stats>({ operativa: {}, archivio: {} });
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<"operativa" | "archivio">("operativa");
  const [filtroDelega, setFiltroDelega] = useState<string>("");
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [filtroStato, setFiltroStato] = useState<string>("");
  const [q, setQ] = useState("");
  const [ordinamento, setOrdinamento] = useState("priorita");
  const [vistaCompatta, setVistaCompatta] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("vistaCompatta") === "1";
    return false;
  });

  function toggleVista() {
    setVistaCompatta(v => { localStorage.setItem("vistaCompatta", v ? "0" : "1"); return !v; });
  }

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/pratiche/stats");
    if (res.ok) setStats(await res.json());
  }, []);

  const fetchPratiche = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ vista });
    if (filtroTipo) params.set("tipo", filtroTipo);
    if (filtroDelega) params.set("delega", filtroDelega);
    if (filtroStato) params.set("stato", filtroStato);
    if (q) params.set("q", q);
    const res = await fetch(`/api/pratiche?${params}`);
    if (res.ok) setPratiche(await res.json());
    setLoading(false);
  }, [vista, filtroTipo, filtroDelega, filtroStato, q]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { setFiltroStato(""); fetchPratiche(); }, [fetchPratiche]);

  function esporta(formato: "xlsx" | "pdf") {
    const params = new URLSearchParams({ vista });
    if (filtroTipo) params.set("tipo", filtroTipo);
    if (filtroDelega) params.set("delega", filtroDelega);
    if (filtroStato) params.set("stato", filtroStato);
    if (q) params.set("q", q);
    params.set("formato", formato);
    window.open(`/api/export?${params}`, "_blank");
  }

  const statVista = stats[vista];
  const totaleVista = Object.values(statVista).reduce((a, b) => a + b, 0);

  const praticheOrdinate = ordinamento === "priorita"
    ? ordinaPerPriorita(pratiche, p => p.priorita, p => p.createdAt)
    : [...pratiche].sort((a, b) => {
        if (ordinamento === "vecchia") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (ordinamento === "stato") return a.stato.localeCompare(b.stato);
        if (ordinamento === "titolo") return a.titolo.localeCompare(b.titolo);
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });

  const statiDelVista = vista === "operativa" ? STATI_OPERATIVA : STATI_ARCHIVIO;

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

        {/* Tab Operativa / Archivio */}
        <div className="flex gap-2">
          <button
            onClick={() => { setVista("operativa"); setFiltroStato(""); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors
              ${vista === "operativa" ? "bg-blue-600 text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            ⚡ Operativa
            <span className={`ml-2 text-xs font-mono ${vista === "operativa" ? "text-blue-200" : "text-gray-400"}`}>
              {Object.values(stats.operativa).reduce((a, b) => a + b, 0)}
            </span>
          </button>
          <button
            onClick={() => { setVista("archivio"); setFiltroStato(""); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors
              ${vista === "archivio" ? "bg-gray-700 text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            📁 Archivio
            <span className={`ml-2 text-xs font-mono ${vista === "archivio" ? "text-gray-300" : "text-gray-400"}`}>
              {Object.values(stats.archivio).reduce((a, b) => a + b, 0)}
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
        <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
          <input
            type="search"
            placeholder="Cerca…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2 flex-wrap">
            <select
              value={ordinamento}
              onChange={e => setOrdinamento(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
            >
              <option value="priorita">🔴 Priorità prima</option>
              <option value="recente">↓ Più recente</option>
              <option value="vecchia">↑ Più vecchia</option>
              <option value="stato">Stato A→Z</option>
              <option value="titolo">Titolo A→Z</option>
            </select>
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
            >
              <option value="">Tutti i tipi</option>
              {(["SEGNALAZIONE","MIA_IDEA"] as TipoPratica[]).map(t => (
                <option key={t} value={t}>{TIPO_LABEL[t]}</option>
              ))}
            </select>
            <select
              value={filtroStato}
              onChange={e => setFiltroStato(e.target.value)}
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
          <div className="text-center py-12 text-gray-400">Caricamento…</div>
        ) : praticheOrdinate.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Nessuna pratica trovata</div>
        ) : vistaCompatta ? (
          <div className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-200 overflow-hidden">
            {praticheOrdinate.map(p => (
              <Link
                key={p.id}
                href={`/dashboard/pratica/${p.id}`}
                className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 transition-colors"
              >
                <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${TIPO_COLORE[p.tipo]}`}>
                  {TIPO_LABEL[p.tipo].slice(0, 3)}
                </span>
                <PrioritaBadgeSmall p={p.priorita} />
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
            {praticheOrdinate.map(p => (
              <Link
                key={p.id}
                href={`/dashboard/pratica/${p.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLORE[p.tipo]}`}>
                        {TIPO_LABEL[p.tipo]}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {DELEGHE_LABEL[p.delega]}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITA_COLORE[p.priorita]}`}>
                        {PRIORITA_LABEL[p.priorita]}
                      </span>
                    </div>
                    <p className="font-medium text-gray-900 truncate">{p.titolo}</p>
                    {(p.luogo || p.segnalante?.nome) && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {p.luogo && <span>📍 {p.luogo}</span>}
                        {p.luogo && p.segnalante?.nome && <span className="mx-1">·</span>}
                        {p.segnalante?.nome && <span>👤 {p.segnalante.nome}</span>}
                      </p>
                    )}
                    {p.note[0] && (
                      <p className="text-xs text-gray-400 mt-1 truncate italic">
                        💬 {p.note[0].testo}
                      </p>
                    )}
                    {p.foto.length > 0 && (
                      <div className="flex gap-1.5 mt-2">
                        {p.foto.slice(0, 3).map(f => (
                          <img key={f.id} src={f.path} alt="" className="w-10 h-10 object-cover rounded-md border border-gray-200" />
                        ))}
                        {p.foto.length > 3 && (
                          <div className="w-10 h-10 rounded-md border border-gray-200 bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                            +{p.foto.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-lg font-medium whitespace-nowrap ${STATO_COLORE[p.stato]}`}>
                      {STATO_LABEL[p.stato]}
                    </span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {new Date(p.updatedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* FAB mobile */}
      <Link
        href="/dashboard/nuova"
        className="fixed bottom-20 right-4 md:hidden bg-blue-600 text-white w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-lg hover:bg-blue-700"
      >
        +
      </Link>
    </div>
  );
}

function PrioritaBadgeSmall({ p }: { p: Priorita }) {
  const dot: Record<Priorita, string> = { ALTA: "bg-red-500", MEDIA: "bg-yellow-400", BASSA: "bg-gray-300" };
  if (p === "MEDIA") return null;
  return <span className={`shrink-0 w-2 h-2 rounded-full ${dot[p]}`} />;
}
