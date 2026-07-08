"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DELEGHE_LABEL, SOTTOCATEGORIE } from "@/lib/constants";
import type { Delega, TipoPratica } from "@prisma/client";

type Persona = { id: number; nome: string; cognome: string; ruolo: string | null };

const TIPI: { value: TipoPratica; label: string; desc: string; emoji: string }[] = [
  { value: "SEGNALAZIONE", label: "Segnalazione cittadino", desc: "Il cittadino mi ha segnalato un problema", emoji: "📢" },
  { value: "MIA_IDEA", label: "Mia idea", desc: "Un'idea o proposta che voglio sviluppare", emoji: "💡" },
  { value: "PROGETTO", label: "Progetto comunale", desc: "Un progetto già avviato da seguire", emoji: "🏗️" },
];

async function comprimi(file: File): Promise<Blob> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1280;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => resolve(blob ?? file), "image/jpeg", 0.8);
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

export default function NuovaPraticaPage() {
  const router = useRouter();
  const [persone, setPersone] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNuovaPersona, setShowNuovaPersona] = useState(false);
  const [fotoSelezionate, setFotoSelezionate] = useState<File[]>([]);
  const [anteprime, setAnteprime] = useState<string[]>([]);

  const [tipo, setTipo] = useState<TipoPratica>("SEGNALAZIONE");
  const [form, setForm] = useState({
    delega: "" as Delega | "",
    titolo: "",
    descrizione: "",
    luogo: "",
    priorita: "MEDIA" as "BASSA" | "MEDIA" | "ALTA",
    personaId: "" as string,
    segnalantNome: "",
    segnalantTel: "",
    segnalantEmail: "",
  });

  const [nuovaPersona, setNuovaPersona] = useState({ nome: "", cognome: "", ruolo: "", telefono: "", email: "" });

  useEffect(() => {
    fetch("/api/persone").then(r => r.json()).then(setPersone).catch(() => {});
  }, []);

  // Sottocategorie disponibili per la delega selezionata
  const sottocategorie = form.delega ? (SOTTOCATEGORIE[form.delega as Delega] ?? []) : [];

  function selezionaSottocategoria(voce: string) {
    setForm(f => ({ ...f, titolo: voce }));
  }

  function cambiaDelega(delega: string) {
    // Resetta il titolo se era una sottocategoria della vecchia delega
    setForm(f => ({ ...f, delega: delega as Delega | "", titolo: "" }));
  }

  async function aggiungiPersona() {
    const res = await fetch("/api/persone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuovaPersona),
    });
    if (res.ok) {
      const p = await res.json();
      setPersone(prev => [...prev, p]);
      setForm(f => ({ ...f, personaId: String(p.id) }));
      setShowNuovaPersona(false);
      setNuovaPersona({ nome: "", cognome: "", ruolo: "", telefono: "", email: "" });
    }
  }

  function gestisciFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const disponibili = 5 - fotoSelezionate.length;
    const nuove = files.slice(0, disponibili);
    setFotoSelezionate(prev => [...prev, ...nuove]);
    nuove.forEach(f => {
      const reader = new FileReader();
      reader.onload = ev => setAnteprime(prev => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(f);
    });
    e.target.value = "";
  }

  function rimuoviFoto(i: number) {
    setFotoSelezionate(prev => prev.filter((_, idx) => idx !== i));
    setAnteprime(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.delega) return;
    setLoading(true);

    const body: Record<string, unknown> = {
      tipo,
      delega: form.delega,
      titolo: form.titolo,
      descrizione: form.descrizione || undefined,
      luogo: form.luogo || undefined,
      priorita: form.priorita,
      personaId: form.personaId ? Number(form.personaId) : undefined,
    };

    if (tipo === "SEGNALAZIONE" && (form.segnalantNome || form.segnalantTel || form.segnalantEmail)) {
      body.segnalante = {
        nome: form.segnalantNome || undefined,
        telefono: form.segnalantTel || undefined,
        email: form.segnalantEmail || undefined,
      };
    }

    const res = await fetch("/api/pratiche", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) { setLoading(false); return; }
    const p = await res.json();

    for (const foto of fotoSelezionate) {
      const blob = await comprimi(foto);
      const fd = new FormData();
      fd.append("foto", blob, "foto.jpg");
      await fetch(`/api/pratiche/${p.id}/foto`, { method: "POST", body: fd });
    }

    setLoading(false);
    router.push(`/dashboard/pratica/${p.id}`);
  }

  const field = (key: keyof typeof form, value: string) =>
    setForm(f => ({ ...f, [key]: value }));

  return (
    <div className="space-y-5 pb-8">
      <h1 className="text-xl font-bold text-gray-900">Nuova pratica</h1>

      {/* Selezione tipo */}
      <div className="grid gap-2">
        {TIPI.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTipo(t.value)}
            className={`text-left p-4 rounded-xl border-2 transition-colors ${
              tipo === t.value ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{t.emoji}</span>
              <div>
                <p className="font-medium text-gray-900">{t.label}</p>
                <p className="text-xs text-gray-500">{t.desc}</p>
              </div>
              {tipo === t.value && <span className="ml-auto text-blue-500 font-bold">✓</span>}
            </div>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Delega */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Delega *</label>
          <select
            value={form.delega}
            onChange={e => cambiaDelega(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Seleziona delega…</option>
            {(Object.keys(DELEGHE_LABEL) as Delega[]).map(d => (
              <option key={d} value={d}>{DELEGHE_LABEL[d]}</option>
            ))}
          </select>
        </div>

        {/* Sottocategorie rapide — appaiono solo se la delega ha voci preimpostate */}
        {sottocategorie.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Selezione rapida</p>
            <div className="flex flex-wrap gap-2">
              {sottocategorie.map(voce => (
                <button
                  key={voce}
                  type="button"
                  onClick={() => selezionaSottocategoria(voce)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    form.titolo === voce
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600"
                  }`}
                >
                  {voce}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Titolo — si pre-compila con la selezione rapida, ma rimane editabile */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Titolo * {sottocategorie.length > 0 && <span className="text-gray-400 font-normal">(o scrivi liberamente)</span>}
          </label>
          <input
            type="text"
            value={form.titolo}
            onChange={e => field("titolo", e.target.value)}
            required
            placeholder={
              tipo === "SEGNALAZIONE" ? "Es. Mancato ritiro spazzatura via Roma" :
              tipo === "MIA_IDEA" ? "Es. Etichette bidoni differenziata" :
              "Es. Rifacimento spogliatoio campo sportivo"
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Luogo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Luogo</label>
          <input
            type="text"
            value={form.luogo}
            onChange={e => field("luogo", e.target.value)}
            placeholder="Es. Via Roma 12, Lerici"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Descrizione */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
          <textarea
            value={form.descrizione}
            onChange={e => field("descrizione", e.target.value)}
            rows={3}
            placeholder="Dettagli aggiuntivi…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Priorità */}
        <div className="flex gap-3">
          {([["BASSA","⚪ Bassa","border-gray-400 bg-gray-50 text-gray-700"],["MEDIA","🟡 Media","border-yellow-400 bg-yellow-50 text-yellow-700"],["ALTA","🔴 Alta","border-red-500 bg-red-50 text-red-700"]] as const).map(([val, label, activeClass]) => (
            <button
              key={val}
              type="button"
              onClick={() => field("priorita", val)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                form.priorita === val ? activeClass : "border-gray-200 text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Dati segnalante (solo SEGNALAZIONE) */}
        {tipo === "SEGNALAZIONE" && (
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Dati cittadino <span className="text-gray-400 font-normal">(opzionali)</span></p>
            <input type="text" placeholder="Nome" value={form.segnalantNome}
              onChange={e => field("segnalantNome", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            <input type="tel" placeholder="Telefono" value={form.segnalantTel}
              onChange={e => field("segnalantTel", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            <input type="email" placeholder="Email" value={form.segnalantEmail}
              onChange={e => field("segnalantEmail", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
        )}

        {/* Persona di riferimento */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Persona di riferimento</label>
          <select
            value={form.personaId}
            onChange={e => setForm(f => ({ ...f, personaId: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Nessuna</option>
            {persone.map(p => (
              <option key={p.id} value={p.id}>{p.nome} {p.cognome}{p.ruolo ? ` — ${p.ruolo}` : ""}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowNuovaPersona(!showNuovaPersona)}
            className="text-xs text-blue-600 mt-1 hover:underline"
          >
            + Aggiungi nuova persona
          </button>
        </div>

        {showNuovaPersona && (
          <div className="bg-blue-50 rounded-xl p-4 space-y-2 border border-blue-200">
            <p className="text-sm font-medium text-blue-800">Nuova persona</p>
            {(["nome","cognome","ruolo","telefono","email"] as const).map(k => (
              <input key={k} type={k === "email" ? "email" : "text"}
                placeholder={k.charAt(0).toUpperCase() + k.slice(1)}
                value={nuovaPersona[k]}
                onChange={e => setNuovaPersona(p => ({ ...p, [k]: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            ))}
            <div className="flex gap-2">
              <button type="button" onClick={aggiungiPersona}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium">
                Salva
              </button>
              <button type="button" onClick={() => setShowNuovaPersona(false)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600">
                Annulla
              </button>
            </div>
          </div>
        )}

        {/* Foto */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Foto <span className="text-gray-400 font-normal">({fotoSelezionate.length}/5)</span>
            </label>
            {fotoSelezionate.length < 5 && (
              <label className="text-sm text-blue-600 cursor-pointer hover:underline">
                + Aggiungi
                <input type="file" accept="image/*" multiple className="hidden" onChange={gestisciFoto} />
              </label>
            )}
          </div>
          {anteprime.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {anteprime.map((src, i) => (
                <div key={i} className="relative aspect-square">
                  <img src={src} alt="" className="w-full h-full object-cover rounded-lg" />
                  <button
                    type="button"
                    onClick={() => rimuoviFoto(i)}
                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl py-3 text-sm transition-colors disabled:opacity-50"
        >
          {loading ? "Salvataggio…" : "Salva pratica"}
        </button>
      </form>
    </div>
  );
}
