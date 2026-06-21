"use client";

import { useEffect, useState } from "react";
import { DELEGHE_LABEL } from "@/lib/constants";

type Appuntamento = {
  id: number;
  titolo: string;
  descrizione: string | null;
  luogo: string | null;
  dataOra: string;
  googleEventId: string | null;
  pratica: { id: number; titolo: string; delega: string } | null;
};

export default function AppuntamentiPage() {
  const [appuntamenti, setAppuntamenti] = useState<Appuntamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titolo: "", descrizione: "", luogo: "", dataOra: "" });
  const [saving, setSaving] = useState(false);
  const [eliminando, setEliminando] = useState<number | null>(null);

  async function eliminaAppuntamento(id: number) {
    if (!confirm("Eliminare questo appuntamento?")) return;
    setEliminando(id);
    const res = await fetch(`/api/appuntamenti/${id}`, { method: "DELETE" });
    if (res.ok) setAppuntamenti(prev => prev.filter(a => a.id !== id));
    setEliminando(null);
  }

  useEffect(() => {
    fetch("/api/appuntamenti")
      .then(r => r.json())
      .then(data => { setAppuntamenti(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function salvaAppuntamento(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/appuntamenti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, dataOra: new Date(form.dataOra).toISOString() }),
    });
    if (res.ok) {
      const a = await res.json();
      setAppuntamenti(prev => [...prev, a].sort((a, b) => new Date(a.dataOra).getTime() - new Date(b.dataOra).getTime()));
      setForm({ titolo: "", descrizione: "", luogo: "", dataOra: "" });
      setShowForm(false);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Agenda</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium"
        >
          + Appuntamento
        </button>
      </div>

      {showForm && (
        <form onSubmit={salvaAppuntamento} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="font-medium text-gray-800">Nuovo appuntamento</p>
          <input
            type="text" placeholder="Titolo *" required
            value={form.titolo} onChange={e => setForm(f => ({ ...f, titolo: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
          />
          <input
            type="datetime-local" required
            value={form.dataOra} onChange={e => setForm(f => ({ ...f, dataOra: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
          />
          <input
            type="text" placeholder="Luogo"
            value={form.luogo} onChange={e => setForm(f => ({ ...f, luogo: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
          />
          <textarea
            placeholder="Descrizione"
            value={form.descrizione} onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
              {saving ? "Salvataggio…" : "Salva + Google Calendar"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600">
              Annulla
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Caricamento…</div>
      ) : appuntamenti.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Nessun appuntamento futuro</div>
      ) : (
        <div className="space-y-3">
          {appuntamenti.map(a => {
            const d = new Date(a.dataOra);
            return (
              <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4">
                <div className="text-center min-w-[48px]">
                  <p className="text-2xl font-bold text-blue-600">{d.getDate()}</p>
                  <p className="text-xs text-gray-500">{d.toLocaleDateString("it-IT", { month: "short" })}</p>
                  <p className="text-xs text-gray-400">{d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{a.titolo}</p>
                  {a.luogo && <p className="text-xs text-gray-500 mt-0.5">📍 {a.luogo}</p>}
                  {a.pratica && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Pratica: {a.pratica.titolo} · {DELEGHE_LABEL[a.pratica.delega as keyof typeof DELEGHE_LABEL]}
                    </p>
                  )}
                  {a.googleEventId && (
                    <span className="text-xs text-green-600 mt-1 inline-block">✓ Google Calendar</span>
                  )}
                </div>
                <button
                  onClick={() => eliminaAppuntamento(a.id)}
                  disabled={eliminando === a.id}
                  className="text-gray-300 hover:text-red-500 transition-colors text-lg self-start disabled:opacity-50"
                  title="Elimina"
                >
                  🗑
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
