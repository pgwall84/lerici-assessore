"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DELEGHE_LABEL } from "@/lib/constants";
import type { ArgomentoRiunione, Delega, DocumentoProgetto, NotaProgetto, Progetto, Riunione, StatoProgetto, StatoRiunione } from "@prisma/client";

const STATO_RIUNIONE_LABEL: Record<StatoRiunione, string> = {
  IN_PREPARAZIONE: "In preparazione",
  PRONTA: "Pronta",
  IN_CORSO: "In corso",
  CONCLUSA: "Conclusa",
};

const STATO_RIUNIONE_COLORE: Record<StatoRiunione, string> = {
  IN_PREPARAZIONE: "bg-gray-100 text-gray-600",
  PRONTA: "bg-blue-100 text-blue-700",
  IN_CORSO: "bg-yellow-100 text-yellow-800",
  CONCLUSA: "bg-green-100 text-green-800",
};

type RiunioneCard = Riunione & { argomenti: ArgomentoRiunione[] };

const STATO_LABEL: Record<StatoProgetto, string> = {
  IN_CORSO: "In corso",
  SOSPESO: "Sospeso",
  CONCLUSO: "Concluso",
  ARCHIVIATO: "Archiviato",
};

const STATO_COLORE: Record<StatoProgetto, string> = {
  IN_CORSO: "bg-yellow-100 text-yellow-800",
  SOSPESO: "bg-gray-100 text-gray-600",
  CONCLUSO: "bg-green-100 text-green-800",
  ARCHIVIATO: "bg-gray-100 text-gray-500",
};

const STATI: StatoProgetto[] = ["IN_CORSO", "SOSPESO", "CONCLUSO", "ARCHIVIATO"];

type ProgettoFull = Progetto & {
  responsabile: { id: number; nome: string; cognome: string; ruolo: string | null; telefono: string | null; email: string | null } | null;
  note: NotaProgetto[];
  documenti: DocumentoProgetto[];
};

export default function ProgettoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [progetto, setProgetto] = useState<ProgettoFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [nuovaNota, setNuovaNota] = useState("");
  const [savingNota, setSavingNota] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [persone, setPersone] = useState<{ id: number; nome: string; cognome: string; ruolo: string | null }[]>([]);
  const [assegnaMode, setAssegnaMode] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [modificaMode, setModificaMode] = useState(false);
  const [formModifica, setFormModifica] = useState({ titolo: "", descrizione: "", delega: "" as Delega | "", fonteFinanziamento: "" });
  const [riunioni, setRiunioni] = useState<RiunioneCard[]>([]);

  useEffect(() => {
    fetch(`/api/progetti/${id}`)
      .then(r => r.json())
      .then(data => { setProgetto(data); setLoading(false); })
      .catch(() => setLoading(false));
    fetch("/api/persone").then(r => r.json()).then(setPersone).catch(() => {});
    fetch(`/api/riunioni?progettoId=${id}`).then(r => r.json()).then(setRiunioni).catch(() => {});
  }, [id]);

  async function cambiaStato(stato: StatoProgetto) {
    const res = await fetch(`/api/progetti/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato }),
    });
    if (res.ok) {
      const aggiornato = await res.json();
      setProgetto(p => p ? { ...p, stato: aggiornato.stato } : p);
    }
  }

  function apriModifica() {
    if (!progetto) return;
    setFormModifica({
      titolo: progetto.titolo,
      descrizione: progetto.descrizione ?? "",
      delega: progetto.delega,
      fonteFinanziamento: progetto.fonteFinanziamento ?? "",
    });
    setModificaMode(true);
  }

  async function salvaModifica() {
    const res = await fetch(`/api/progetti/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titolo: formModifica.titolo,
        descrizione: formModifica.descrizione || null,
        delega: formModifica.delega || undefined,
        fonteFinanziamento: formModifica.fonteFinanziamento || null,
      }),
    });
    if (res.ok) {
      const aggiornato = await res.json();
      setProgetto(p => p ? { ...p, ...aggiornato } : p);
      setModificaMode(false);
    }
  }

  async function eliminaProgetto() {
    if (!confirm(`Eliminare definitivamente "${progetto?.titolo}"?\n\nL'operazione non è reversibile.`)) return;
    const res = await fetch(`/api/progetti/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard/progetti");
    else alert("Errore durante l'eliminazione");
  }

  async function assegnaReferente() {
    if (!selectedPersonaId) return;
    const res = await fetch(`/api/progetti/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responsabileId: Number(selectedPersonaId) }),
    });
    if (res.ok) {
      const aggiornato = await res.json();
      setProgetto(p => p ? { ...p, responsabile: aggiornato.responsabile } : p);
      setAssegnaMode(false);
      setSelectedPersonaId("");
    }
  }

  async function aggiungiNota() {
    if (!nuovaNota.trim()) return;
    setSavingNota(true);
    const res = await fetch(`/api/progetti/${id}/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testo: nuovaNota.trim() }),
    });
    if (res.ok) {
      const nota = await res.json();
      setProgetto(p => p ? { ...p, note: [...p.note, nota] } : p);
      setNuovaNota("");
    }
    setSavingNota(false);
  }

  async function caricaDocumento(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file, file.name);
    const res = await fetch(`/api/progetti/${id}/documenti`, { method: "POST", body: formData });
    if (res.ok) {
      const documento = await res.json();
      setProgetto(p => p ? { ...p, documenti: [...p.documenti, documento] } : p);
    } else {
      const err = await res.json();
      alert(err.error ?? "Errore upload");
    }
    setUploading(false);
    e.target.value = "";
  }

  async function eliminaDocumento(documentoId: string) {
    if (!confirm("Eliminare questo documento?")) return;
    const res = await fetch(`/api/progetti/${id}/documenti`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentoId }),
    });
    if (res.ok) setProgetto(p => p ? { ...p, documenti: p.documenti.filter(d => d.id !== documentoId) } : p);
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Caricamento…</div>;
  if (!progetto) return <div className="text-center py-12 text-gray-400">Progetto non trovato</div>;

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-lg">←</button>
        <h1 className="text-lg font-bold text-gray-900 flex-1 min-w-0 truncate">{progetto.titolo}</h1>
        <button onClick={apriModifica} className="text-xs text-blue-600 hover:underline shrink-0">✏️ Modifica</button>
        <button onClick={eliminaProgetto} className="text-xs text-red-500 hover:underline shrink-0">🗑️ Elimina</button>
      </div>

      {/* Badge */}
      <div className="flex flex-wrap gap-2">
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATO_COLORE[progetto.stato]}`}>
          {STATO_LABEL[progetto.stato]}
        </span>
        <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
          {DELEGHE_LABEL[progetto.delega]}
        </span>
      </div>

      {/* Info base */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
        {progetto.descrizione && <p className="text-gray-700">{progetto.descrizione}</p>}
        {progetto.fonteFinanziamento && <p className="text-gray-500">💰 {progetto.fonteFinanziamento}</p>}
        <p className="text-gray-400 text-xs">
          Creato il {new Date(progetto.createdAt).toLocaleDateString("it-IT")}
        </p>
      </div>

      {/* Responsabile */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-gray-700">📋 Responsabile</p>
          <button onClick={() => setAssegnaMode(m => !m)} className="text-xs text-blue-600 hover:underline">
            {progetto.responsabile ? "Cambia" : "+ Assegna"}
          </button>
        </div>

        {progetto.responsabile ? (
          <div>
            <p className="font-medium">{progetto.responsabile.nome} {progetto.responsabile.cognome}</p>
            {progetto.responsabile.ruolo && <p className="text-gray-500">{progetto.responsabile.ruolo}</p>}
            {progetto.responsabile.telefono && <p className="text-gray-500">{progetto.responsabile.telefono}</p>}
            {progetto.responsabile.email && <p className="text-gray-500">{progetto.responsabile.email}</p>}
          </div>
        ) : (
          <p className="text-gray-400 text-xs">Nessun responsabile assegnato</p>
        )}

        {assegnaMode && (
          <div className="flex gap-2">
            <select
              value={selectedPersonaId}
              onChange={e => setSelectedPersonaId(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleziona…</option>
              {persone.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nome} {p.cognome}{p.ruolo ? ` — ${p.ruolo}` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={assegnaReferente}
              disabled={!selectedPersonaId}
              className="bg-blue-600 text-white rounded-lg px-3 text-xs font-medium disabled:opacity-50"
            >
              ✓
            </button>
          </div>
        )}
      </div>

      {/* Cambio stato */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="font-medium text-gray-700 mb-3 text-sm">Cambia stato</p>
        <div className="grid grid-cols-2 gap-2">
          {STATI.map(s => (
            <button
              key={s}
              onClick={() => cambiaStato(s)}
              disabled={s === progetto.stato}
              className={`text-xs py-2 px-3 rounded-lg border-2 font-medium transition-colors ${
                s === progetto.stato
                  ? `${STATO_COLORE[s]} border-transparent`
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {STATO_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Documenti */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium text-gray-700 text-sm">Documenti {progetto.documenti.length > 0 && `(${progetto.documenti.length})`}</p>
          <label className={`text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg cursor-pointer ${uploading ? "opacity-50" : "hover:bg-blue-700"}`}>
            {uploading ? "Caricamento…" : "📎 Aggiungi"}
            <input type="file" className="hidden" onChange={caricaDocumento} disabled={uploading} />
          </label>
        </div>
        {progetto.documenti.length === 0 ? (
          <p className="text-xs text-gray-400">Nessun documento</p>
        ) : (
          <div className="space-y-2">
            {progetto.documenti.map(d => (
              <div key={d.id} className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-2">
                <a href={d.storageUrl} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-sm text-blue-700 truncate hover:underline">
                  📄 {d.nomeFile}
                </a>
                <button onClick={() => eliminaDocumento(d.id)} className="text-xs text-red-500 hover:underline shrink-0">
                  Elimina
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Riunioni */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium text-gray-700 text-sm">🎙️ Riunioni</p>
          <Link
            href={`/dashboard/riunioni/nuova?progettoId=${progetto.id}`}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
          >
            🎙️ Nuova riunione
          </Link>
        </div>
        {riunioni.length === 0 ? (
          <p className="text-xs text-gray-400">Nessuna riunione ancora</p>
        ) : (
          <div className="space-y-2">
            {riunioni.map(r => {
              const trattati = r.argomenti.filter(a => a.spuntato).length;
              return (
                <Link
                  key={r.id}
                  href={r.stato === "IN_PREPARAZIONE" ? `/dashboard/riunioni/${r.id}/revisione` : `/dashboard/riunioni/${r.id}`}
                  className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2 hover:border-gray-300 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate">{r.titolo}</p>
                    {r.argomenti.length > 0 && (
                      <p className="text-xs text-gray-400">{trattati}/{r.argomenti.length} trattati</p>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATO_RIUNIONE_COLORE[r.stato]}`}>
                    {STATO_RIUNIONE_LABEL[r.stato]}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Popup modifica */}
      {modificaMode && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-lg space-y-3 shadow-xl">
            <p className="font-medium text-gray-800">✏️ Modifica progetto</p>
            <div>
              <label className="text-xs text-gray-500">Titolo</label>
              <input
                value={formModifica.titolo}
                onChange={e => setFormModifica(f => ({ ...f, titolo: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Descrizione</label>
              <textarea
                value={formModifica.descrizione}
                onChange={e => setFormModifica(f => ({ ...f, descrizione: e.target.value }))}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500 resize"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Delega</label>
              <select
                value={formModifica.delega}
                onChange={e => setFormModifica(f => ({ ...f, delega: e.target.value as Delega | "" }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(Object.keys(DELEGHE_LABEL) as Delega[]).map(d => (
                  <option key={d} value={d}>{DELEGHE_LABEL[d]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Fonte di finanziamento</label>
              <input
                value={formModifica.fonteFinanziamento}
                onChange={e => setFormModifica(f => ({ ...f, fonteFinanziamento: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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

      {/* Diario evoluzioni */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="font-medium text-gray-700 mb-3 text-sm">📋 Diario evoluzioni</p>
        <div className="flex gap-2 mb-4">
          <textarea
            value={nuovaNota}
            onChange={e => setNuovaNota(e.target.value)}
            placeholder="Aggiungi aggiornamento…"
            rows={2}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <button
            onClick={aggiungiNota}
            disabled={savingNota || !nuovaNota.trim()}
            className="bg-blue-600 text-white rounded-lg px-4 text-sm font-medium disabled:opacity-50"
          >
            ✓
          </button>
        </div>
        <div className="space-y-2">
          {progetto.note.length === 0 && (
            <p className="text-xs text-gray-400">Nessun aggiornamento ancora</p>
          )}
          {[...progetto.note].reverse().map((n, i) => (
            <div key={n.id} className={`rounded-lg px-3 py-2 border-l-2 ${i === 0 ? "bg-blue-50 border-blue-400" : "bg-gray-50 border-gray-200"}`}>
              <p className="text-sm text-gray-800">{n.testo}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(n.createdAt).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
