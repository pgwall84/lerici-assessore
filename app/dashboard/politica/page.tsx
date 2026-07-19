"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  TIPO_ATTO_LABEL, TIPO_ATTO_LABEL_BREVE, TIPO_ATTO_ICONA,
  STATO_ATTO_LABEL, STATO_ATTO_COLORE,
  STATI_ATTO_OPERATIVA, STATI_ATTO_ARCHIVIO,
} from "@/lib/constants";
import { ordinaPerPriorita } from "@/lib/ordinamento";
import { PrioritaBadge, PrioritaDot } from "@/components/PrioritaBadge";
import type { AttoPoliticoAmministrativo, DocumentoAtto, Priorita, StatoAtto, TipoAtto } from "@prisma/client";

const TIPI: TipoAtto[] = ["CONVOCAZIONE_CONSIGLIO", "CONVOCAZIONE_COMMISSIONE", "MOZIONE", "INTERROGAZIONE", "CONVOCAZIONE_GIUNTA"];

type AttoCard = AttoPoliticoAmministrativo & { documenti: DocumentoAtto[] };

export default function PoliticaPage() {
  const [atti, setAtti] = useState<AttoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<"operativa" | "archivio">("operativa");
  const [filtroTipo, setFiltroTipo] = useState<TipoAtto | "">("");
  const [filtroStato, setFiltroStato] = useState<StatoAtto | "">("");
  const [filtroPriorita, setFiltroPriorita] = useState<Priorita | "">("");
  const [importando, setImportando] = useState(false);
  const [vistaCompatta, setVistaCompatta] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("vistaCompattaAtti") === "1";
    return false;
  });

  function toggleVista() {
    setVistaCompatta(v => { localStorage.setItem("vistaCompattaAtti", v ? "0" : "1"); return !v; });
  }

  function carica() {
    fetch("/api/atti")
      .then(r => r.json())
      .then(data => { setAtti(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(carica, []);

  async function importaDaMail() {
    setImportando(true);
    const res = await fetch("/api/importa-automatico", { method: "POST" });
    setImportando(false);
    if (res.ok) {
      const r = await res.json();
      carica();
      alert(
        r.primaEsecuzione
          ? `Prima esecuzione del motore mail: ${r.scansionate} mail nuove classificate, nessuna eseguita in automatico — conferma almeno una voce dalla revisione per attivare il binario automatico.`
          : `${r.completati} completate automaticamente, ${r.inAttesa} in attesa (conferma manuale o ODG da scegliere).${r.errori.length > 0 ? `\n\nErrori:\n${r.errori.join("\n")}` : ""}`
      );
    } else {
      alert("Errore durante l'importazione automatica");
    }
  }

  const statiDelVista = vista === "operativa" ? STATI_ATTO_OPERATIVA : STATI_ATTO_ARCHIVIO;

  const attiVista = useMemo(
    () => atti.filter(a => statiDelVista.includes(a.stato)),
    [atti, statiDelVista]
  );

  const statVista = useMemo(() => {
    const conteggi: Partial<Record<TipoAtto, number>> = {};
    for (const a of attiVista) conteggi[a.tipo] = (conteggi[a.tipo] ?? 0) + 1;
    return conteggi;
  }, [attiVista]);

  const totaleVista = attiVista.length;
  const totaleOperativa = atti.filter(a => STATI_ATTO_OPERATIVA.includes(a.stato)).length;
  const totaleArchivio = atti.filter(a => STATI_ATTO_ARCHIVIO.includes(a.stato)).length;

  const attiFiltrati = useMemo(() => {
    const filtrati = attiVista.filter(a =>
      (!filtroTipo || a.tipo === filtroTipo) &&
      (!filtroStato || a.stato === filtroStato) &&
      (!filtroPriorita || a.priorita === filtroPriorita)
    );
    return ordinaPerPriorita(filtrati, a => a.priorita, a => a.createdAt);
  }, [attiVista, filtroTipo, filtroStato, filtroPriorita]);

  const daVedere = atti.filter(a => !a.visualizzato).length;

  function esporta(formato: "xlsx" | "pdf") {
    const params = new URLSearchParams({ vista, formato });
    if (filtroTipo) params.set("tipo", filtroTipo);
    if (filtroStato) params.set("stato", filtroStato);
    if (filtroPriorita) params.set("priorita", filtroPriorita);
    window.open(`/api/atti/export?${params}`, "_blank");
  }

  return (
    <div className="flex gap-0 md:gap-5 pb-32">

      {/* Sidebar sotto-categorie — desktop, stesso stile della sidebar Deleghe di Progetti */}
      <aside className="hidden md:flex flex-col gap-0.5 w-44 shrink-0 pt-1">
        <button
          onClick={() => setFiltroTipo("")}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex justify-between items-center
            ${filtroTipo === "" ? "bg-blue-600 text-white font-semibold" : "text-gray-700 hover:bg-gray-100"}`}
        >
          <span>Tutte</span>
          <span className={`text-xs font-mono ${filtroTipo === "" ? "text-blue-100" : "text-gray-400"}`}>
            {totaleVista}
          </span>
        </button>
        {TIPI.map(t => {
          const n = statVista[t] ?? 0;
          const attiva = filtroTipo === t;
          return (
            <button
              key={t}
              onClick={() => setFiltroTipo(t === filtroTipo ? "" : t)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex justify-between items-center gap-1
                ${attiva ? "bg-blue-600 text-white font-semibold" : n === 0 ? "text-gray-300 hover:bg-gray-50" : "text-gray-700 hover:bg-gray-100"}`}
            >
              <span className="truncate leading-tight">{TIPO_ATTO_LABEL_BREVE[t]}</span>
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
          <h1 className="text-lg font-semibold text-gray-900">🏛️ Attività Politico-Amministrativa</h1>
          <div className="flex gap-2">
            <button
              onClick={importaDaMail}
              disabled={importando}
              className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              {importando ? "Importazione…" : "📨 Importa da mail"}
            </button>
            <Link
              href="/dashboard/politica/nuovo"
              className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
            >
              + Nuovo
            </Link>
          </div>
        </div>

        {daVedere > 0 && (
          <span className="inline-block text-xs px-3 py-1.5 rounded-full bg-red-100 text-red-700 font-medium">
            🔴 {daVedere} da vedere
          </span>
        )}

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

        {/* Sotto-categorie mobile (scroll orizzontale) */}
        <div className="md:hidden flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          <button
            onClick={() => setFiltroTipo("")}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors
              ${filtroTipo === "" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"}`}
          >
            Tutte {totaleVista > 0 && <span className="ml-1 opacity-70">{totaleVista}</span>}
          </button>
          {TIPI.map(t => {
            const n = statVista[t] ?? 0;
            if (n === 0 && filtroTipo !== t) return null;
            return (
              <button
                key={t}
                onClick={() => setFiltroTipo(t === filtroTipo ? "" : t)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors
                  ${filtroTipo === t ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"}`}
              >
                {TIPO_ATTO_ICONA[t]} {TIPO_ATTO_LABEL_BREVE[t]} {n > 0 && <span className="ml-1 opacity-70">{n}</span>}
              </button>
            );
          })}
        </div>

        {/* Filtri */}
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={filtroStato}
              onChange={e => setFiltroStato(e.target.value as StatoAtto | "")}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
            >
              <option value="">Tutti gli stati</option>
              {statiDelVista.map(s => (
                <option key={s} value={s}>{STATO_ATTO_LABEL[s]}</option>
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
        ) : attiFiltrati.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🏛️</p>
            <p>Nessun atto trovato</p>
          </div>
        ) : vistaCompatta ? (
          <div className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-200 overflow-hidden">
            {attiFiltrati.map(a => (
              <Link
                key={a.id}
                href={`/dashboard/politica/${a.id}`}
                className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 transition-colors"
              >
                {!a.visualizzato && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                <PrioritaDot priorita={a.priorita} />
                <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                  {TIPO_ATTO_ICONA[a.tipo]}
                </span>
                <span className="font-medium text-gray-900 text-sm truncate flex-1">{a.oggetto}</span>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${STATO_ATTO_COLORE[a.stato]}`}>
                  {STATO_ATTO_LABEL[a.stato]}
                </span>
              </Link>
            ))}
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
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_ATTO_COLORE[a.stato]}`}>
                    {STATO_ATTO_LABEL[a.stato]}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {TIPO_ATTO_ICONA[a.tipo]} {TIPO_ATTO_LABEL[a.tipo]}
                  </span>
                  <PrioritaBadge priorita={a.priorita} />
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
    </div>
  );
}
