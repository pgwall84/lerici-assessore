"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { DELEGHE_LABEL, STATO_COLORE, STATO_LABEL, TIPO_COLORE, TIPO_LABEL } from "@/lib/constants";
import type { Delega, Pratica, StatoPratica, TipoPratica } from "@prisma/client";

type PraticaCard = Pratica & {
  persona: { nome: string; cognome: string } | null;
  segnalante: { nome: string | null } | null;
  foto: { id: number; path: string }[];
};

export default function DashboardPage() {
  const [pratiche, setPratiche] = useState<PraticaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [filtroDelega, setFiltroDelega] = useState<string>("");
  const [filtroStato, setFiltroStato] = useState<string>("");
  const [q, setQ] = useState("");
  const [inviando, setInviando] = useState<number | null>(null);

  async function inviaTelegram(e: React.MouseEvent, id: number) {
    e.preventDefault();
    setInviando(id);
    const res = await fetch(`/api/pratiche/${id}/notifica`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canale: "telegram" }),
    });
    setInviando(null);
    if (!res.ok) alert("Errore invio Telegram");
  }

  function esporta(formato: "xlsx" | "pdf") {
    const params = new URLSearchParams();
    if (filtroTipo) params.set("tipo", filtroTipo);
    if (filtroDelega) params.set("delega", filtroDelega);
    if (filtroStato) params.set("stato", filtroStato);
    if (q) params.set("q", q);
    params.set("formato", formato);
    window.open(`/api/export?${params}`, "_blank");
  }

  const fetchPratiche = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtroTipo) params.set("tipo", filtroTipo);
    if (filtroDelega) params.set("delega", filtroDelega);
    if (filtroStato) params.set("stato", filtroStato);
    if (q) params.set("q", q);
    const res = await fetch(`/api/pratiche?${params}`);
    if (res.ok) setPratiche(await res.json());
    setLoading(false);
  }, [filtroTipo, filtroDelega, filtroStato, q]);

  useEffect(() => { fetchPratiche(); }, [fetchPratiche]);

  return (
    <div className="space-y-4">
      {/* Filtri + Esporta */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <input
          type="search"
          placeholder="Cerca…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={() => esporta("xlsx")} className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors">
            📊 Excel
          </button>
          <button onClick={() => esporta("pdf")} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors">
            📄 PDF
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none"
          >
            <option value="">Tutti i tipi</option>
            {(["SEGNALAZIONE","MIA_IDEA","PROGETTO"] as TipoPratica[]).map(t => (
              <option key={t} value={t}>{TIPO_LABEL[t]}</option>
            ))}
          </select>

          <select
            value={filtroDelega}
            onChange={e => setFiltroDelega(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none"
          >
            <option value="">Tutte le deleghe</option>
            {(Object.keys(DELEGHE_LABEL) as Delega[]).map(d => (
              <option key={d} value={d}>{DELEGHE_LABEL[d]}</option>
            ))}
          </select>

          <select
            value={filtroStato}
            onChange={e => setFiltroStato(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none"
          >
            <option value="">Tutti gli stati</option>
            {(Object.keys(STATO_LABEL) as StatoPratica[]).map(s => (
              <option key={s} value={s}>{STATO_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Caricamento…</div>
      ) : pratiche.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Nessuna pratica trovata</div>
      ) : (
        <div className="space-y-3">
          {pratiche.map(p => (
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
                    {p.priorita === "URGENTE" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                        🔴 Urgente
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-gray-900 truncate">{p.titolo}</p>
                  {p.luogo && <p className="text-xs text-gray-500 mt-0.5">📍 {p.luogo}</p>}
                  {(p.persona || p.segnalante?.nome) && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      👤 {p.persona ? `${p.persona.nome} ${p.persona.cognome}` : p.segnalante?.nome}
                    </p>
                  )}
                  {p.foto.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {p.foto.slice(0, 3).map(f => (
                        <img
                          key={f.id}
                          src={f.path}
                          alt=""
                          className="w-12 h-12 object-cover rounded-md border border-gray-200"
                        />
                      ))}
                      {p.foto.length > 3 && (
                        <div className="w-12 h-12 rounded-md border border-gray-200 bg-gray-100 flex items-center justify-center text-xs text-gray-500 font-medium">
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
                  <button
                    onClick={(e) => inviaTelegram(e, p.id)}
                    disabled={inviando === p.id}
                    className="text-xs px-2 py-1 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors disabled:opacity-50 whitespace-nowrap"
                    title="Invia su Telegram"
                  >
                    {inviando === p.id ? "…" : "✈️ Telegram"}
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

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
