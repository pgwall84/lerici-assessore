"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NuovaGiustificaPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    ufficioMittente: "",
    oggetto: "",
    dataRicezione: new Date().toISOString().slice(0, 10),
  });

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    if (!form.oggetto.trim()) return;
    setSaving(true);
    const res = await fetch("/api/giustifiche", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ufficioMittente: form.ufficioMittente || undefined,
        oggetto: form.oggetto.trim(),
        dataRicezione: new Date(form.dataRicezione).toISOString(),
      }),
    });
    setSaving(false);
    if (res.ok) {
      router.push("/dashboard/giustifiche");
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Errore: ${JSON.stringify(err.error ?? res.status)}`);
    }
  }

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-lg">←</button>
        <h1 className="text-lg font-bold text-gray-900">📝 Nuova giustifica</h1>
      </div>

      <form onSubmit={salva} className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div>
          <label className="text-xs text-gray-500">Ufficio mittente</label>
          <input
            value={form.ufficioMittente}
            onChange={e => setForm(f => ({ ...f, ufficioMittente: e.target.value }))}
            placeholder="es. Ufficio Personale"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500">Oggetto *</label>
          <input
            value={form.oggetto}
            onChange={e => setForm(f => ({ ...f, oggetto: e.target.value }))}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500">Data ricezione</label>
          <input
            type="date"
            value={form.dataRicezione}
            onChange={e => setForm(f => ({ ...f, dataRicezione: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={saving || !form.oggetto.trim()}
          className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
        >
          {saving ? "Salvataggio…" : "Salva giustifica"}
        </button>
      </form>
    </div>
  );
}
