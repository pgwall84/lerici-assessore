"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { PRIORITA_LABEL } from "@/lib/constants";
import type { ArgomentoRiunione, Priorita, Riunione } from "@prisma/client";

type RiunioneFull = Riunione & {
  persona: { id: number; nome: string; cognome: string } | null;
  progetto: { id: string; titolo: string } | null;
  argomenti: ArgomentoRiunione[];
};

export default function RevisioneRiunionePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [riunione, setRiunione] = useState<RiunioneFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [nuovoArgomento, setNuovoArgomento] = useState("");
  const [rigenerando, setRigenerando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [titolo, setTitolo] = useState("");
  const [dataOra, setDataOra] = useState("");
  const [persone, setPersone] = useState<{ id: number; nome: string; cognome: string }[]>([]);
  const [progetti, setProgetti] = useState<{ id: string; titolo: string }[]>([]);

  function carica() {
    fetch(`/api/riunioni/${id}`)
      .then(r => r.json())
      .then((data: RiunioneFull) => {
        setRiunione(data);
        setTitolo(data.titolo);
        setDataOra(data.dataOra ? new Date(data.dataOra).toISOString().slice(0, 16) : "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(carica, [id]);

  useEffect(() => {
    fetch("/api/persone").then(r => r.json()).then(setPersone).catch(() => {});
    fetch("/api/progetti").then(r => r.json())
      .then(data => setProgetti(data.map((p: { id: string; titolo: string }) => ({ id: p.id, titolo: p.titolo }))))
      .catch(() => {});
  }, []);

  async function modificaTesto(argId: string, testo: string) {
    setRiunione(r => r ? { ...r, argomenti: r.argomenti.map(a => a.id === argId ? { ...a, testo } : a) } : r);
  }

  async function salvaTesto(argId: string, testo: string) {
    await fetch(`/api/riunioni/${id}/argomenti/${argId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testo }),
    });
  }

  async function eliminaArgomento(argId: string) {
    await fetch(`/api/riunioni/${id}/argomenti/${argId}`, { method: "DELETE" });
    setRiunione(r => r ? { ...r, argomenti: r.argomenti.filter(a => a.id !== argId) } : r);
  }

  async function aggiungiArgomento() {
    if (!nuovoArgomento.trim()) return;
    const res = await fetch(`/api/riunioni/${id}/argomenti`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testo: nuovoArgomento.trim() }),
    });
    if (res.ok) {
      const argomento = await res.json();
      setRiunione(r => r ? { ...r, argomenti: [...r.argomenti, argomento] } : r);
      setNuovoArgomento("");
    }
  }

  async function sposta(index: number, direzione: -1 | 1) {
    if (!riunione) return;
    const nuovi = [...riunione.argomenti];
    const target = index + direzione;
    if (target < 0 || target >= nuovi.length) return;
    [nuovi[index], nuovi[target]] = [nuovi[target], nuovi[index]];
    setRiunione(r => r ? { ...r, argomenti: nuovi } : r);
    await fetch(`/api/riunioni/${id}/argomenti`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordine: nuovi.map(a => a.id) }),
    });
  }

  async function rigenera() {
    if (!confirm("Rigenerare la checklist dalla trascrizione? Le modifiche manuali fatte finora andranno perse.")) return;
    setRigenerando(true);
    const res = await fetch(`/api/riunioni/${id}/genera-checklist`, { method: "POST" });
    setRigenerando(false);
    if (res.ok) carica();
    else alert("Errore nella rigenerazione");
  }

  // Salvataggio automatico per ogni campo — stesso principio già in uso per la priorità: nessun
  // pulsante "salva" separato, così tutto ("argomenti e ogni altro dato della riunione") resta
  // modificabile in un unico posto finché la riunione è IN_PREPARAZIONE.
  async function salvaCampo(campo: string, valore: unknown) {
    await fetch(`/api/riunioni/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: valore }),
    });
  }

  async function cambiaPriorita(priorita: Priorita | "") {
    setRiunione(r => r ? { ...r, priorita: priorita || null } : r);
    await salvaCampo("priorita", priorita || null);
  }

  async function cambiaPersona(personaId: string) {
    await salvaCampo("personaId", personaId === "" ? null : Number(personaId));
  }

  async function cambiaProgetto(progettoId: string) {
    await salvaCampo("progettoId", progettoId === "" ? null : progettoId);
  }

  async function cambiaDataOra(valore: string) {
    setDataOra(valore);
    await salvaCampo("dataOra", valore ? new Date(valore).toISOString() : null);
  }

  async function iniziaRiunione() {
    setSalvando(true);
    const res = await fetch(`/api/riunioni/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titolo: titolo.trim(), stato: "IN_CORSO" }),
    });
    setSalvando(false);
    if (res.ok) router.push(`/dashboard/riunioni/${id}`);
    else alert("Errore nel salvataggio");
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Caricamento…</div>;
  if (!riunione) return <div className="text-center py-12 text-gray-400">Riunione non trovata</div>;

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-lg">←</button>
        <h1 className="text-lg font-bold text-gray-900 flex-1 min-w-0 truncate">{riunione.titolo}</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div>
          <label className="text-xs text-gray-500">Titolo</label>
          <input
            value={titolo}
            onChange={e => setTitolo(e.target.value)}
            onBlur={e => salvaCampo("titolo", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Data e ora</label>
          <input
            type="datetime-local"
            value={dataOra}
            onChange={e => cambiaDataOra(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Persona collegata</label>
          <select
            value={riunione.personaId ?? ""}
            onChange={e => cambiaPersona(e.target.value)}
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
            value={riunione.progettoId ?? ""}
            onChange={e => cambiaProgetto(e.target.value)}
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
            value={riunione.priorita ?? ""}
            onChange={e => cambiaPriorita(e.target.value as Priorita | "")}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Non specificata</option>
            {(Object.keys(PRIORITA_LABEL) as Priorita[]).map(p => (
              <option key={p} value={p}>{PRIORITA_LABEL[p]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Rivedi, correggi o aggiungi argomenti</p>
        <button onClick={rigenera} disabled={rigenerando} className="text-xs text-blue-600 hover:underline shrink-0 disabled:opacity-50">
          {rigenerando ? "…" : "🔄 Rigenera"}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
        {riunione.argomenti.length === 0 && (
          <p className="text-xs text-gray-400">Nessun argomento — aggiungine uno qui sotto</p>
        )}
        {riunione.argomenti.map((a, i) => (
          <div key={a.id} className="flex items-center gap-1.5">
            <div className="flex flex-col shrink-0">
              <button onClick={() => sposta(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none">▲</button>
              <button onClick={() => sposta(i, 1)} disabled={i === riunione.argomenti.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none">▼</button>
            </div>
            <input
              value={a.testo}
              onChange={e => modificaTesto(a.id, e.target.value)}
              onBlur={e => salvaTesto(a.id, e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={() => eliminaArgomento(a.id)} className="text-gray-400 hover:text-red-500 shrink-0 px-1">✕</button>
          </div>
        ))}

        <div className="flex gap-2 pt-2">
          <input
            value={nuovoArgomento}
            onChange={e => setNuovoArgomento(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); aggiungiArgomento(); } }}
            placeholder="+ aggiungi argomento…"
            className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={aggiungiArgomento} disabled={!nuovoArgomento.trim()} className="bg-gray-100 text-gray-700 rounded-lg px-3 text-sm disabled:opacity-50">
            +
          </button>
        </div>
      </div>

      <button
        onClick={iniziaRiunione}
        disabled={salvando || riunione.argomenti.length === 0 || !titolo.trim()}
        className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
      >
        {salvando ? "Avvio…" : "▶ Inizia riunione"}
      </button>
    </div>
  );
}
