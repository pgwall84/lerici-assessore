"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AttoPoliticoAmministrativo, DocumentoAtto, StatoAtto, TipoAtto } from "@prisma/client";

const TIPO_LABEL: Record<TipoAtto, string> = {
  CONVOCAZIONE_GIUNTA: "Convocazione Giunta",
  CONVOCAZIONE_CONSIGLIO: "Convocazione Consiglio",
  CONVOCAZIONE_COMMISSIONE: "Convocazione Commissione",
  MOZIONE: "Mozione",
  INTERROGAZIONE: "Interrogazione",
};

const TIPO_ICONA: Record<TipoAtto, string> = {
  CONVOCAZIONE_GIUNTA: "🏛️",
  CONVOCAZIONE_CONSIGLIO: "🏛️",
  CONVOCAZIONE_COMMISSIONE: "🗂️",
  MOZIONE: "📄",
  INTERROGAZIONE: "❓",
};

const STATO_LABEL: Record<StatoAtto, string> = {
  DA_ESAMINARE: "Da esaminare",
  ESAMINATO: "Esaminato",
  RISPOSTO: "Risposto",
  ARCHIVIATO: "Archiviato",
};

const STATO_COLORE: Record<StatoAtto, string> = {
  DA_ESAMINARE: "bg-yellow-100 text-yellow-800",
  ESAMINATO: "bg-blue-100 text-blue-700",
  RISPOSTO: "bg-green-100 text-green-800",
  ARCHIVIATO: "bg-gray-100 text-gray-500",
};

const TIPI: TipoAtto[] = ["CONVOCAZIONE_GIUNTA", "CONVOCAZIONE_CONSIGLIO", "CONVOCAZIONE_COMMISSIONE", "MOZIONE", "INTERROGAZIONE"];

type AttoCard = AttoPoliticoAmministrativo & { documenti: DocumentoAtto[] };

export default function PoliticaPage() {
  const [atti, setAtti] = useState<AttoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<TipoAtto | "">("");
  const [nascondiArchiviati, setNascondiArchiviati] = useState(true);

  useEffect(() => {
    fetch("/api/atti")
      .then(r => r.json())
      .then(data => { setAtti(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const attiFiltrati = atti.filter(a =>
    (!filtroTipo || a.tipo === filtroTipo) &&
    (!nascondiArchiviati || a.stato !== "ARCHIVIATO")
  );

  const daVedere = atti.filter(a => !a.visualizzato).length;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">🏛️ Attività Politico-Amministrativa</h1>
        <Link
          href="/dashboard/politica/nuovo"
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
        >
          + Nuovo
        </Link>
      </div>

      {daVedere > 0 && (
        <span className="inline-block text-xs px-3 py-1.5 rounded-full bg-red-100 text-red-700 font-medium">
          🔴 {daVedere} da vedere
        </span>
      )}

      {/* Filtri */}
      <div className="flex gap-2 flex-wrap items-center">
        <button
          onClick={() => setFiltroTipo("")}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors
            ${filtroTipo === "" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"}`}
        >
          Tutti
        </button>
        {TIPI.map(t => (
          <button
            key={t}
            onClick={() => setFiltroTipo(t === filtroTipo ? "" : t)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors
              ${filtroTipo === t ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"}`}
          >
            {TIPO_ICONA[t]} {TIPO_LABEL[t]}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto">
          <input type="checkbox" checked={nascondiArchiviati} onChange={e => setNascondiArchiviati(e.target.checked)} />
          Nascondi archiviati
        </label>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Caricamento…</div>
      ) : attiFiltrati.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🏛️</p>
          <p>Nessun atto trovato</p>
        </div>
      ) : (
        <div className="space-y-3">
          {attiFiltrati.map(a => (
            <Link
              key={a.id}
              href={`/dashboard/politica/${a.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex flex-wrap gap-1.5 mb-1.5 items-center">
                {!a.visualizzato && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_COLORE[a.stato]}`}>
                  {STATO_LABEL[a.stato]}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {TIPO_ICONA[a.tipo]} {TIPO_LABEL[a.tipo]}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-900 leading-snug">{a.oggetto}</p>
              <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                {a.dataSeduta && <span>📅 Seduta {new Date(a.dataSeduta).toLocaleDateString("it-IT")}</span>}
                {a.scadenzaRisposta && <span>⏰ Risposta entro {new Date(a.scadenzaRisposta).toLocaleDateString("it-IT")}</span>}
                {a.documenti.length > 0 && <span>📎 {a.documenti.length}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
