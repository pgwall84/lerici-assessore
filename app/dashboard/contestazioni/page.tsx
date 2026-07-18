"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import type { Contestazione, DocumentoContestazione, EsitoContestazione, Gestore } from "@prisma/client";

const GESTORE_LABEL: Record<Gestore, string> = {
  ACAM_AMBIENTE: "ACAM Ambiente",
  ACAM_ACQUE: "ACAM Acque",
  ATC: "ATC",
};

const ESITO_LABEL: Record<EsitoContestazione, string> = {
  IN_ATTESA: "In attesa",
  RISOLTO: "Risolto",
  RESPINTO: "Respinto",
  SENZA_RISPOSTA: "Senza risposta",
};

const ESITO_COLORE: Record<EsitoContestazione, string> = {
  IN_ATTESA: "bg-yellow-100 text-yellow-800",
  RISOLTO: "bg-green-100 text-green-800",
  RESPINTO: "bg-red-50 text-red-600",
  SENZA_RISPOSTA: "bg-gray-100 text-gray-500",
};

const GESTORI: Gestore[] = ["ACAM_AMBIENTE", "ACAM_ACQUE", "ATC"];

type ContestazioneCard = Contestazione & { documenti: DocumentoContestazione[] };

function meseAnno(data: string | Date): string {
  return new Date(data).toLocaleDateString("it-IT", { month: "short", year: "numeric" });
}

export default function ContestazioniPage() {
  const [contestazioni, setContestazioni] = useState<ContestazioneCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<"elenco" | "andamento">("elenco");
  const [filtroGestore, setFiltroGestore] = useState<Gestore | "">("");
  const [filtroEsito, setFiltroEsito] = useState<EsitoContestazione | "">("");

  useEffect(() => {
    fetch("/api/contestazioni")
      .then(r => r.json())
      .then(data => { setContestazioni(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const contestazioniFiltrate = contestazioni.filter(c =>
    (!filtroGestore || c.gestore === filtroGestore) &&
    (!filtroEsito || c.esito === filtroEsito)
  );

  // Vista aggregata: conteggio per gestore, per mese (dal più recente)
  const andamento = useMemo(() => {
    const mesi = new Map<string, Record<Gestore, number>>();
    for (const c of contestazioni) {
      const chiave = meseAnno(c.createdAt);
      if (!mesi.has(chiave)) mesi.set(chiave, { ACAM_AMBIENTE: 0, ACAM_ACQUE: 0, ATC: 0 });
      mesi.get(chiave)![c.gestore]++;
    }
    return Array.from(mesi.entries()).slice(0, 12);
  }, [contestazioni]);

  const totaliPerGestore = useMemo(() => {
    const totali: Record<Gestore, number> = { ACAM_AMBIENTE: 0, ACAM_ACQUE: 0, ATC: 0 };
    for (const c of contestazioni) totali[c.gestore]++;
    return totali;
  }, [contestazioni]);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">⚠️ Contestazioni</h1>
        <Link
          href="/dashboard/contestazioni/nuova"
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
        >
          + Nuova
        </Link>
      </div>

      {/* Tab Elenco / Andamento */}
      <div className="flex gap-2">
        <button
          onClick={() => setVista("elenco")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors
            ${vista === "elenco" ? "bg-blue-600 text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
        >
          📋 Elenco
        </button>
        <button
          onClick={() => setVista("andamento")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors
            ${vista === "andamento" ? "bg-gray-700 text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
        >
          📊 Andamento per gestore
        </button>
      </div>

      {vista === "elenco" ? (
        <>
          {/* Filtri */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFiltroGestore("")}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors
                ${filtroGestore === "" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"}`}
            >
              Tutti i gestori
            </button>
            {GESTORI.map(g => (
              <button
                key={g}
                onClick={() => setFiltroGestore(g === filtroGestore ? "" : g)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors
                  ${filtroGestore === g ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"}`}
              >
                {GESTORE_LABEL[g]} {totaliPerGestore[g] > 0 && <span className="ml-1 opacity-70">{totaliPerGestore[g]}</span>}
              </button>
            ))}
            <select
              value={filtroEsito}
              onChange={e => setFiltroEsito(e.target.value as EsitoContestazione | "")}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tutti gli esiti</option>
              {(Object.keys(ESITO_LABEL) as EsitoContestazione[]).map(e => (
                <option key={e} value={e}>{ESITO_LABEL[e]}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">Caricamento…</div>
          ) : contestazioniFiltrate.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">⚠️</p>
              <p>Nessuna contestazione trovata</p>
            </div>
          ) : (
            <div className="space-y-3">
              {contestazioniFiltrate.map(c => (
                <Link
                  key={c.id}
                  href={`/dashboard/contestazioni/${c.id}`}
                  className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESITO_COLORE[c.esito]}`}>
                      {ESITO_LABEL[c.esito]}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {GESTORE_LABEL[c.gestore]}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 leading-snug">{c.oggetto}</p>
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                    {c.dataInvio && <span>📅 Inviata {new Date(c.dataInvio).toLocaleDateString("it-IT")}</span>}
                    {c.documenti.length > 0 && <span>📎 {c.documenti.length}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-x-auto">
          {andamento.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">Nessun dato ancora</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-3 font-medium">Mese</th>
                  {GESTORI.map(g => (
                    <th key={g} className="py-2 px-3 font-medium text-right">{GESTORE_LABEL[g]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {andamento.map(([mese, conteggi]) => (
                  <tr key={mese} className="border-b border-gray-50">
                    <td className="py-2 pr-3 text-gray-700 capitalize">{mese}</td>
                    {GESTORI.map(g => (
                      <td key={g} className={`py-2 px-3 text-right font-mono ${conteggi[g] >= 5 ? "text-red-600 font-semibold" : "text-gray-600"}`}>
                        {conteggi[g] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td className="py-2 pr-3 font-semibold text-gray-800">Totale</td>
                  {GESTORI.map(g => (
                    <td key={g} className="py-2 px-3 text-right font-mono font-semibold text-gray-800">{totaliPerGestore[g]}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          )}
          <p className="text-xs text-gray-400 mt-3">Evidenziate in rosso le celle con 5 o più contestazioni nello stesso mese — utile per individuare pattern ricorrenti con un gestore.</p>
        </div>
      )}
    </div>
  );
}
