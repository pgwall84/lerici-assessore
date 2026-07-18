"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TipoAtto } from "@prisma/client";

const TIPO_LABEL: Record<TipoAtto, string> = {
  CONVOCAZIONE_GIUNTA: "Convocazione Giunta",
  CONVOCAZIONE_CONSIGLIO: "Convocazione Consiglio",
  CONVOCAZIONE_COMMISSIONE: "Convocazione Commissione",
  MOZIONE: "Mozione",
  INTERROGAZIONE: "Interrogazione",
};

const TIPI: TipoAtto[] = ["CONVOCAZIONE_GIUNTA", "CONVOCAZIONE_CONSIGLIO", "CONVOCAZIONE_COMMISSIONE", "MOZIONE", "INTERROGAZIONE"];

export default function NuovoAttoPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tipo: "" as TipoAtto | "",
    oggetto: "",
    dataSeduta: "",
    scadenzaRisposta: "",
  });

  const mostraScadenza = form.tipo === "MOZIONE" || form.tipo === "INTERROGAZIONE";

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    if (!form.oggetto.trim() || !form.tipo) return;
    setSaving(true);
    const res = await fetch("/api/atti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: form.tipo,
        oggetto: form.oggetto.trim(),
        dataSeduta: form.dataSeduta ? new Date(form.dataSeduta).toISOString() : undefined,
        scadenzaRisposta: form.scadenzaRisposta ? new Date(form.scadenzaRisposta).toISOString() : undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const atto = await res.json();
      router.push(`/dashboard/politica/${atto.id}`);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Errore: ${JSON.stringify(err.error ?? res.status)}`);
    }
  }

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-lg">←</button>
        <h1 className="text-lg font-bold text-gray-900">🏛️ Nuovo atto</h1>
      </div>

      <form onSubmit={salva} className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div>
          <label className="text-xs text-gray-500">Tipo *</label>
          <select
            value={form.tipo}
            onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoAtto | "" }))}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Seleziona…</option>
            {TIPI.map(t => (
              <option key={t} value={t}>{TIPO_LABEL[t]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500">Oggetto *</label>
          <input
            value={form.oggetto}
            onChange={e => setForm(f => ({ ...f, oggetto: e.target.value }))}
            required
            placeholder="es. Convocazione Giunta del 22 luglio"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500">Data seduta (facoltativa)</label>
          <input
            type="date"
            value={form.dataSeduta}
            onChange={e => setForm(f => ({ ...f, dataSeduta: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {mostraScadenza && (
          <div>
            <label className="text-xs text-gray-500">Scadenza risposta (facoltativa)</label>
            <input
              type="date"
              value={form.scadenzaRisposta}
              onChange={e => setForm(f => ({ ...f, scadenzaRisposta: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !form.oggetto.trim() || !form.tipo}
          className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
        >
          {saving ? "Salvataggio…" : "Salva atto"}
        </button>
      </form>
    </div>
  );
}
