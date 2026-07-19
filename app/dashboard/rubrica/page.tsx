"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Persona = {
  id: number;
  nome: string;
  cognome: string;
  ruolo: string | null;
  azienda: string | null;
  telefono: string | null;
  email: string | null;
  emailSecondaria: string | null;
};

type CampoForm = "nome" | "cognome" | "ruolo" | "azienda" | "telefono" | "email" | "emailSecondaria";

const CAMPI_CREAZIONE: CampoForm[] = ["nome", "cognome", "ruolo", "azienda", "telefono", "email"];
const CAMPI_MODIFICA: CampoForm[] = ["nome", "cognome", "ruolo", "azienda", "telefono", "email", "emailSecondaria"];

const CAMPO_LABEL: Record<CampoForm, string> = {
  nome: "Nome",
  cognome: "Cognome",
  ruolo: "Ruolo",
  azienda: "Azienda",
  telefono: "Telefono",
  email: "Email",
  emailSecondaria: "Email secondaria",
};

const FORM_VUOTO = { nome: "", cognome: "", ruolo: "", azienda: "", telefono: "", email: "", emailSecondaria: "" };

export default function RubricaPage() {
  const [persone, setPersone] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VUOTO);
  const [saving, setSaving] = useState(false);
  const [modificando, setModificando] = useState<Persona | null>(null);
  const [formMod, setFormMod] = useState(FORM_VUOTO);

  useEffect(() => {
    fetch("/api/persone")
      .then(r => r.json())
      .then(data => { setPersone(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function salvaPersona(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/persone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const p = await res.json();
      setPersone(prev => [...prev, p].sort((a, b) => a.cognome.localeCompare(b.cognome)));
      setForm(FORM_VUOTO);
      setShowForm(false);
    }
    setSaving(false);
  }

  function apriModifica(p: Persona) {
    setModificando(p);
    setFormMod({
      nome: p.nome,
      cognome: p.cognome,
      ruolo: p.ruolo ?? "",
      azienda: p.azienda ?? "",
      telefono: p.telefono ?? "",
      email: p.email ?? "",
      emailSecondaria: p.emailSecondaria ?? "",
    });
  }

  async function salvaModifica(e: React.FormEvent) {
    e.preventDefault();
    if (!modificando) return;
    setSaving(true);
    const res = await fetch(`/api/persone/${modificando.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formMod),
    });
    if (res.ok) {
      const aggiornata = await res.json();
      setPersone(prev => prev.map(p => p.id === aggiornata.id ? aggiornata : p).sort((a, b) => a.cognome.localeCompare(b.cognome)));
      setModificando(null);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Rubrica</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium"
        >
          + Persona
        </button>
      </div>

      {showForm && (
        <form onSubmit={salvaPersona} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="font-medium text-gray-800">Nuova persona</p>
          {CAMPI_CREAZIONE.map(k => (
            <input
              key={k}
              type={k === "email" ? "email" : "text"}
              placeholder={CAMPO_LABEL[k] + (["nome","cognome"].includes(k) ? " *" : "")}
              required={["nome","cognome"].includes(k)}
              value={form[k]}
              onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
            />
          ))}
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
              {saving ? "Salvataggio…" : "Salva"}
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
      ) : (
        <div className="space-y-2">
          {persone.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{p.nome} {p.cognome}</p>
                  {(p.ruolo || p.azienda) && (
                    <p className="text-xs text-gray-500">
                      {p.ruolo}{p.ruolo && p.azienda && " — "}{p.azienda}
                    </p>
                  )}
                  {p.telefono && <p className="text-xs text-gray-400 mt-0.5">{p.telefono}</p>}
                  {p.email && <p className="text-xs text-gray-400">{p.email}</p>}
                </div>
                <div className="flex gap-1.5 items-center">
                  <Link href={`/dashboard/riunioni/nuova?personaId=${p.id}`} className="text-sm bg-gray-100 rounded-lg px-2.5 py-1.5 hover:bg-gray-200">🎙️</Link>
                  {p.telefono && (
                    <a href={`tel:${p.telefono}`} className="text-sm bg-gray-100 rounded-lg px-2.5 py-1.5 hover:bg-gray-200">📞</a>
                  )}
                  {p.email && (
                    <a href={`mailto:${p.email}`} className="text-sm bg-gray-100 rounded-lg px-2.5 py-1.5 hover:bg-gray-200">📧</a>
                  )}
                  {p.telefono && (
                    <a href={`whatsapp://send?phone=${p.telefono.replace(/\D/g,"")}`} className="text-sm bg-gray-100 rounded-lg px-2.5 py-1.5 hover:bg-gray-200">💬</a>
                  )}
                  <button onClick={() => apriModifica(p)} className="text-sm bg-gray-100 rounded-lg px-2.5 py-1.5 hover:bg-gray-200">✏️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Popup modifica */}
      {modificando && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <form onSubmit={salvaModifica} className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3 shadow-xl">
            <p className="font-medium text-gray-800">✏️ Modifica contatto</p>
            {CAMPI_MODIFICA.map(k => (
              <input
                key={k}
                type={k === "email" || k === "emailSecondaria" ? "email" : "text"}
                placeholder={CAMPO_LABEL[k] + (["nome","cognome"].includes(k) ? " *" : "")}
                required={["nome","cognome"].includes(k)}
                value={formMod[k]}
                onChange={e => setFormMod(f => ({ ...f, [k]: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ))}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setModificando(null)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
                Annulla
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                {saving ? "…" : "Salva"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
