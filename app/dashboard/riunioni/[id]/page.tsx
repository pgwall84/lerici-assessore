"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { STATO_RIUNIONE_LABEL, STATO_RIUNIONE_COLORE, PRIORITA_LABEL } from "@/lib/constants";
import { PrioritaBadge } from "@/components/PrioritaBadge";
import type { ArgomentoRiunione, Priorita, Riunione } from "@prisma/client";

type RiunioneFull = Riunione & {
  persona: { id: number; nome: string; cognome: string } | null;
  progetto: { id: string; titolo: string } | null;
  argomenti: ArgomentoRiunione[];
};

const STATO_LABEL = STATO_RIUNIONE_LABEL;
const STATO_COLORE = STATO_RIUNIONE_COLORE;

export default function RiunionePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [riunione, setRiunione] = useState<RiunioneFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [persone, setPersone] = useState<{ id: number; nome: string; cognome: string }[]>([]);
  const [progetti, setProgetti] = useState<{ id: string; titolo: string }[]>([]);
  const [modificaMode, setModificaMode] = useState(false);
  const [formModifica, setFormModifica] = useState({
    titolo: "", dataOra: "", personaId: "" as number | "", progettoId: "" as string | "", priorita: "" as Priorita | "",
  });

  useEffect(() => {
    fetch(`/api/riunioni/${id}`)
      .then(r => r.json())
      .then(async (data: RiunioneFull) => {
        if (data.stato === "IN_PREPARAZIONE") {
          router.replace(`/dashboard/riunioni/${id}/revisione`);
          return;
        }
        if (data.stato === "PRONTA") {
          const res = await fetch(`/api/riunioni/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stato: "IN_CORSO" }),
          });
          if (res.ok) data = await res.json();
        }
        setRiunione(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetch("/api/persone").then(r => r.json()).then(setPersone).catch(() => {});
    fetch("/api/progetti").then(r => r.json()).then(data => setProgetti(data.map((p: { id: string; titolo: string }) => ({ id: p.id, titolo: p.titolo })))).catch(() => {});
  }, [id, router]);

  async function toggleArgomento(argId: string, spuntatoAttuale: boolean) {
    setRiunione(r => r ? {
      ...r,
      argomenti: r.argomenti.map(a => a.id === argId ? { ...a, spuntato: !spuntatoAttuale, spuntatoAt: !spuntatoAttuale ? new Date() : null } : a),
    } : r);
    await fetch(`/api/riunioni/${id}/argomenti/${argId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spuntato: !spuntatoAttuale }),
    });
  }

  async function concludiRiunione() {
    if (!confirm("Concludere la riunione?")) return;
    const res = await fetch(`/api/riunioni/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato: "CONCLUSA" }),
    });
    if (res.ok) {
      const aggiornata = await res.json();
      setRiunione(r => r ? { ...r, stato: aggiornata.stato } : r);
    }
  }

  async function riapriRiunione() {
    const res = await fetch(`/api/riunioni/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato: "IN_CORSO" }),
    });
    if (res.ok) {
      const aggiornata = await res.json();
      setRiunione(r => r ? { ...r, stato: aggiornata.stato } : r);
    }
  }

  function apriModifica() {
    if (!riunione) return;
    setFormModifica({
      titolo: riunione.titolo,
      dataOra: riunione.dataOra ? new Date(riunione.dataOra).toISOString().slice(0, 16) : "",
      personaId: riunione.personaId ?? "",
      progettoId: riunione.progettoId ?? "",
      priorita: riunione.priorita ?? "",
    });
    setModificaMode(true);
  }

  async function salvaModifica() {
    const res = await fetch(`/api/riunioni/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titolo: formModifica.titolo,
        dataOra: formModifica.dataOra ? new Date(formModifica.dataOra).toISOString() : null,
        personaId: formModifica.personaId === "" ? null : Number(formModifica.personaId),
        progettoId: formModifica.progettoId === "" ? null : formModifica.progettoId,
        priorita: formModifica.priorita || null,
      }),
    });
    if (res.ok) {
      const aggiornata = await res.json();
      setRiunione(r => r ? { ...r, ...aggiornata } : r);
      setModificaMode(false);
    }
  }

  async function eliminaRiunione() {
    if (!confirm(`Eliminare definitivamente "${riunione?.titolo}"?\n\nL'operazione non è reversibile.`)) return;
    const res = await fetch(`/api/riunioni/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard/riunioni");
    else alert("Errore durante l'eliminazione");
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Caricamento…</div>;
  if (!riunione) return <div className="text-center py-12 text-gray-400">Riunione non trovata</div>;

  const conclusa = riunione.stato === "CONCLUSA";
  const trattati = riunione.argomenti.filter(a => a.spuntato).length;

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-lg">←</button>
        <h1 className="text-lg font-bold text-gray-900 flex-1 min-w-0 truncate">{riunione.titolo}</h1>
        <button onClick={apriModifica} className="text-xs text-blue-600 hover:underline shrink-0">✏️ Modifica</button>
        <button onClick={eliminaRiunione} className="text-xs text-red-500 hover:underline shrink-0">🗑️ Elimina</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATO_COLORE[riunione.stato]}`}>
          {STATO_LABEL[riunione.stato]}
        </span>
        <PrioritaBadge priorita={riunione.priorita} />
        <span className="text-xs text-gray-500">{trattati}/{riunione.argomenti.length} trattati</span>
      </div>

      {riunione.dataOra && (
        <p className="text-xs text-gray-500">📅 {new Date(riunione.dataOra).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
      )}
      {riunione.persona && (
        <Link href="/dashboard/rubrica" className="text-xs text-blue-600 hover:underline block">
          👤 {riunione.persona.nome} {riunione.persona.cognome}
        </Link>
      )}
      {riunione.progetto && (
        <Link href={`/dashboard/progetti/${riunione.progetto.id}`} className="text-xs text-blue-600 hover:underline block">
          📁 {riunione.progetto.titolo}
        </Link>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-2">
        {riunione.argomenti.map(a => (
          <button
            key={a.id}
            onClick={() => !conclusa && toggleArgomento(a.id, a.spuntato)}
            disabled={conclusa}
            className="w-full flex items-start gap-3 px-3 py-3 text-left border-b border-gray-50 last:border-0 disabled:cursor-default"
          >
            <span className={`shrink-0 mt-0.5 w-6 h-6 rounded-md border-2 flex items-center justify-center text-sm ${
              a.spuntato ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300"
            }`}>
              {a.spuntato ? "✓" : ""}
            </span>
            <span className={`text-sm flex-1 ${a.spuntato ? "line-through text-gray-400" : "text-gray-800"}`}>
              {a.testo}
            </span>
          </button>
        ))}
      </div>

      {!conclusa ? (
        <button
          onClick={concludiRiunione}
          className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-700"
        >
          ✓ Concludi riunione
        </button>
      ) : (
        <button
          onClick={riapriRiunione}
          className="w-full border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50"
        >
          ↺ Riapri riunione
        </button>
      )}

      {/* Popup modifica */}
      {modificaMode && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-lg space-y-3 shadow-xl">
            <p className="font-medium text-gray-800">✏️ Modifica riunione</p>
            <div>
              <label className="text-xs text-gray-500">Titolo</label>
              <input
                value={formModifica.titolo}
                onChange={e => setFormModifica(f => ({ ...f, titolo: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Data e ora</label>
              <input
                type="datetime-local"
                value={formModifica.dataOra}
                onChange={e => setFormModifica(f => ({ ...f, dataOra: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Persona collegata</label>
              <select
                value={formModifica.personaId}
                onChange={e => setFormModifica(f => ({ ...f, personaId: e.target.value === "" ? "" : Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— nessuna —</option>
                {persone.map(p => (
                  <option key={p.id} value={p.id}>{p.nome} {p.cognome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Progetto collegato</label>
              <select
                value={formModifica.progettoId}
                onChange={e => setFormModifica(f => ({ ...f, progettoId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— nessuno —</option>
                {progetti.map(p => (
                  <option key={p.id} value={p.id}>{p.titolo}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Priorità</label>
              <select
                value={formModifica.priorita}
                onChange={e => setFormModifica(f => ({ ...f, priorita: e.target.value as Priorita | "" }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Non specificata</option>
                {(Object.keys(PRIORITA_LABEL) as Priorita[]).map(p => (
                  <option key={p} value={p}>{PRIORITA_LABEL[p]}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setModificaMode(false)} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600">
                Annulla
              </button>
              <button onClick={salvaModifica} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
