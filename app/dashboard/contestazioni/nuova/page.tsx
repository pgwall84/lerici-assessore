"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Gestore } from "@prisma/client";

const GESTORE_LABEL: Record<Gestore, string> = {
  ACAM_AMBIENTE: "ACAM Ambiente",
  ACAM_ACQUE: "ACAM Acque",
  ATC: "ATC",
};

const GESTORI: Gestore[] = ["ACAM_AMBIENTE", "ACAM_ACQUE", "ATC"];

export default function NuovaContestazionePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    gestore: "" as Gestore | "",
    oggetto: "",
    descrizione: "",
    dataInvio: "",
  });

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    if (!form.oggetto.trim() || !form.gestore) return;
    setSaving(true);
    const res = await fetch("/api/contestazioni", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gestore: form.gestore,
        oggetto: form.oggetto.trim(),
        descrizione: form.descrizione || undefined,
        dataInvio: form.dataInvio ? new Date(form.dataInvio).toISOString() : undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const contestazione = await res.json();
      router.push(`/dashboard/contestazioni/${contestazione.id}`);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Errore: ${JSON.stringify(err.error ?? res.status)}`);
    }
  }

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-lg">←</button>
        <h1 className="text-lg font-bold text-gray-900">⚠️ Nuova contestazione</h1>
      </div>

      <form onSubmit={salva} className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div>
          <label className="text-xs text-gray-500">Gestore *</label>
          <select
            value={form.gestore}
            onChange={e => setForm(f => ({ ...f, gestore: e.target.value as Gestore | "" }))}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Seleziona…</option>
            {GESTORI.map(g => (
              <option key={g} value={g}>{GESTORE_LABEL[g]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500">Oggetto *</label>
          <input
            value={form.oggetto}
            onChange={e => setForm(f => ({ ...f, oggetto: e.target.value }))}
            required
            placeholder="es. Mancato ritiro rifiuti Via Roma"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500">Descrizione</label>
          <textarea
            value={form.descrizione}
            onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500 resize"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500">Data invio (facoltativa)</label>
          <input
            type="date"
            value={form.dataInvio}
            onChange={e => setForm(f => ({ ...f, dataInvio: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={saving || !form.oggetto.trim() || !form.gestore}
          className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
        >
          {saving ? "Salvataggio…" : "Salva contestazione"}
        </button>
      </form>
    </div>
  );
}
