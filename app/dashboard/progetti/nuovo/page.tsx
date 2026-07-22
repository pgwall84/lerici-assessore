"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DELEGHE_LABEL, PRIORITA_LABEL } from "@/lib/constants";
import type { Delega, Priorita } from "@prisma/client";

type Persona = { id: number; nome: string; cognome: string; ruolo: string | null };

export default function NuovoProgettoPage() {
  const router = useRouter();
  const [persone, setPersone] = useState<Persona[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    titolo: "",
    delega: "" as Delega | "",
    descrizione: "",
    responsabileId: "" as string,
    fonteFinanziamento: "",
    priorita: "" as Priorita | "",
  });

  useEffect(() => {
    fetch("/api/persone").then(r => r.json()).then(setPersone).catch(() => {});
  }, []);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titolo.trim() || !form.delega) return;
    setSaving(true);
    const res = await fetch("/api/progetti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titolo: form.titolo.trim(),
        delega: form.delega,
        descrizione: form.descrizione || undefined,
        responsabileId: form.responsabileId ? Number(form.responsabileId) : undefined,
        fonteFinanziamento: form.fonteFinanziamento || undefined,
        priorita: form.priorita || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const progetto = await res.json();
      router.push(`/dashboard/progetti/${progetto.id}`);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Errore: ${JSON.stringify(err.error ?? res.status)}`);
    }
  }

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-lg">←</button>
        <h1 className="text-lg font-bold text-gray-900">📁 Nuovo progetto</h1>
      </div>

      <form onSubmit={salva} className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div>
          <label className="text-xs text-gray-500">Titolo *</label>
          <input
            value={form.titolo}
            onChange={e => setForm(f => ({ ...f, titolo: e.target.value }))}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500">Delega *</label>
          <select
            value={form.delega}
            onChange={e => setForm(f => ({ ...f, delega: e.target.value as Delega | "" }))}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Seleziona…</option>
            {(Object.keys(DELEGHE_LABEL) as Delega[]).map(d => (
              <option key={d} value={d}>{DELEGHE_LABEL[d]}</option>
            ))}
          </select>
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
          <label className="text-xs text-gray-500">Responsabile (facoltativo)</label>
          <select
            value={form.responsabileId}
            onChange={e => setForm(f => ({ ...f, responsabileId: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— nessuno —</option>
            {persone.map(p => (
              <option key={p.id} value={p.id}>
                {p.nome} {p.cognome}{p.ruolo ? ` — ${p.ruolo}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500">Fonte di finanziamento (facoltativo)</label>
          <input
            value={form.fonteFinanziamento}
            onChange={e => setForm(f => ({ ...f, fonteFinanziamento: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500">Priorità (facoltativa)</label>
          <select
            value={form.priorita}
            onChange={e => setForm(f => ({ ...f, priorita: e.target.value as Priorita | "" }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Non specificata</option>
            {(Object.keys(PRIORITA_LABEL) as Priorita[]).map(p => (
              <option key={p} value={p}>{PRIORITA_LABEL[p]}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={saving || !form.titolo.trim() || !form.delega}
          className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
        >
          {saving ? "Salvataggio…" : "Salva progetto"}
        </button>
      </form>
    </div>
  );
}
