"use client";

import { useEffect, useState } from "react";
import { DELEGHE_LABEL } from "@/lib/constants";
import type { Bando, Delega, StatoBando } from "@prisma/client";

const STATO_LABEL: Record<StatoBando, string> = {
  NUOVO: "Nuovo",
  VALUTATO: "Valutato",
  INTERESSANTE: "Interessante",
  SCARTATO: "Scartato",
  SCADUTO: "Scaduto",
};

const STATO_COLORE: Record<StatoBando, string> = {
  NUOVO: "bg-blue-100 text-blue-700",
  VALUTATO: "bg-gray-100 text-gray-600",
  INTERESSANTE: "bg-green-100 text-green-700",
  SCARTATO: "bg-red-50 text-red-400",
  SCADUTO: "bg-gray-50 text-gray-400",
};

const STATI: StatoBando[] = ["NUOVO", "VALUTATO", "INTERESSANTE", "SCARTATO", "SCADUTO"];

function giorniAllaScadenza(data: string): number {
  return Math.ceil((new Date(data).getTime() - Date.now()) / 86400000);
}

export default function BandiPage() {
  const [bandi, setBandi] = useState<Bando[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStato, setFiltroStato] = useState<StatoBando | "">("");
  const [filtroDelega, setFiltroDelega] = useState<Delega | "">("");
  const [espanso, setEspanso] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filtroStato) params.set("stato", filtroStato);
    if (filtroDelega) params.set("delega", filtroDelega);
    setLoading(true);
    fetch(`/api/bandi?${params}`)
      .then(r => r.json())
      .then(data => { setBandi(data); setLoading(false); });
  }, [filtroStato, filtroDelega]);

  async function cambiaStato(id: string, stato: StatoBando) {
    const res = await fetch(`/api/bandi/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato }),
    });
    if (res.ok) {
      const aggiornato = await res.json();
      setBandi(bs => bs.map(b => b.id === id ? aggiornato : b));
    }
  }

  async function cambiaDelega(id: string, delega: Delega | "") {
    const res = await fetch(`/api/bandi/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delega: delega || null }),
    });
    if (res.ok) {
      const aggiornato = await res.json();
      setBandi(bs => bs.map(b => b.id === id ? aggiornato : b));
    }
  }

  const bandiVisibili = bandi.filter(b => b.stato !== "SCARTATO" || filtroStato === "SCARTATO");
  const nuovi = bandi.filter(b => b.stato === "NUOVO").length;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">📢 Bandi</h1>
          <p className="text-xs text-gray-500">Aggiornato lun/mer/ven alle 09:00</p>
        </div>
        {nuovi > 0 && (
          <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">{nuovi} nuovi</span>
        )}
      </div>

      {/* Filtri */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={filtroStato}
          onChange={e => setFiltroStato(e.target.value as StatoBando | "")}
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
      ) : bandiVisibili.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p>Nessun bando trovato</p>
          <p className="text-xs mt-1">Il controllo automatico gira lunedì, mercoledì e venerdì alle 09:00</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bandiVisibili.map(b => {
            const giorni = b.dataChiusura ? giorniAllaScadenza(b.dataChiusura as unknown as string) : null;
            const scadenzaVicina = giorni !== null && giorni >= 0 && giorni <= 15;
            const scaduto = giorni !== null && giorni < 0;

            return (
              <div key={b.id} className={`bg-white rounded-xl border transition-colors ${b.stato === "INTERESSANTE" ? "border-green-300" : b.stato === "SCARTATO" ? "border-gray-100 opacity-50" : "border-gray-200"}`}>
                {/* Header */}
                <div className="p-4">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_COLORE[b.stato]}`}>
                          {STATO_LABEL[b.stato]}
                        </span>
                        {b.delega && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {DELEGHE_LABEL[b.delega as Delega]}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900 leading-snug">{b.titolo}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{b.ente}</p>
                      <div className="flex flex-wrap gap-3 mt-1.5 text-xs">
                        {b.dotazione && <span className="text-gray-600">💰 {b.dotazione}</span>}
                        {b.dataChiusura && (
                          <span className={scaduto ? "text-gray-400" : scadenzaVicina ? "text-red-600 font-medium" : "text-gray-600"}>
                            ⏰ {scaduto ? "Scaduto" : `Scade ${new Date(b.dataChiusura as unknown as string).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}`}
                            {!scaduto && scadenzaVicina && ` (${giorni}gg)`}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setEspanso(espanso === b.id ? null : b.id)}
                      className="text-xs text-blue-600 shrink-0 mt-0.5"
                    >
                      {espanso === b.id ? "▲" : "▼"}
                    </button>
                  </div>

                  {/* Azioni rapide */}
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    {(["VALUTATO", "INTERESSANTE", "SCARTATO"] as StatoBando[]).map(s => (
                      <button
                        key={s}
                        onClick={() => cambiaStato(b.id, s)}
                        disabled={b.stato === s}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-30 ${
                          b.stato === s ? `${STATO_COLORE[s]} border-transparent` : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {STATO_LABEL[s]}
                      </button>
                    ))}
                    <a
                      href={b.bandoUrl ?? b.fonteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2.5 py-1 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      🔗 Apri
                    </a>
                  </div>
                </div>

                {/* Dettaglio espanso */}
                {espanso === b.id && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50 rounded-b-xl">
                    {b.descrizione && (
                      <p className="text-xs text-gray-700 whitespace-pre-wrap">{b.descrizione}</p>
                    )}
                    {b.beneficiari && (
                      <p className="text-xs text-gray-600">👥 <span className="font-medium">Beneficiari:</span> {b.beneficiari}</p>
                    )}
                    <div>
                      <label className="text-xs text-gray-500">Delega</label>
                      <select
                        value={b.delega ?? ""}
                        onChange={e => cambiaDelega(b.id, e.target.value as Delega | "")}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs mt-1 focus:outline-none"
                      >
                        <option value="">— nessuna —</option>
                        {(Object.keys(DELEGHE_LABEL) as Delega[]).map(d => (
                          <option key={d} value={d}>{DELEGHE_LABEL[d]}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-gray-400">
                      Rilevato il {new Date(b.createdAt as unknown as string).toLocaleDateString("it-IT")} da {b.ente}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
