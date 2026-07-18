"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import type { Contestazione, DocumentoContestazione, EsitoContestazione, Gestore } from "@prisma/client";

const GESTORE_LABEL: Record<Gestore, string> = {
  ACAM_AMBIENTE: "ACAM Ambiente",
  ACAM_ACQUE: "ACAM Acque",
  ATC: "ATC",
};

const ESITO_LABEL: Record<EsitoContestazione, string> = {
  IN_ATTESA: "In attesa",
  RISOLTO: "Risolto",
  RESPINTO: "Respinto",
  SENZA_RISPOSTA: "Senza risposta",
};

const ESITO_COLORE: Record<EsitoContestazione, string> = {
  IN_ATTESA: "bg-yellow-100 text-yellow-800",
  RISOLTO: "bg-green-100 text-green-800",
  RESPINTO: "bg-red-50 text-red-600",
  SENZA_RISPOSTA: "bg-gray-100 text-gray-500",
};

const ESITI: EsitoContestazione[] = ["IN_ATTESA", "RISOLTO", "RESPINTO", "SENZA_RISPOSTA"];

type ContestazioneFull = Contestazione & { documenti: DocumentoContestazione[] };

export default function ContestazionePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [contestazione, setContestazione] = useState<ContestazioneFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [modificaMode, setModificaMode] = useState(false);
  const [formModifica, setFormModifica] = useState({ oggetto: "", descrizione: "", gestore: "" as Gestore | "", dataInvio: "", noteEsito: "" });

  useEffect(() => {
    fetch(`/api/contestazioni/${id}`)
      .then(r => r.json())
      .then(data => { setContestazione(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  async function cambiaEsito(esito: EsitoContestazione) {
    const res = await fetch(`/api/contestazioni/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ esito }),
    });
    if (res.ok) {
      const aggiornata = await res.json();
      setContestazione(c => c ? { ...c, esito: aggiornata.esito } : c);
    }
  }

  function apriModifica() {
    if (!contestazione) return;
    setFormModifica({
      oggetto: contestazione.oggetto,
      descrizione: contestazione.descrizione ?? "",
      gestore: contestazione.gestore,
      dataInvio: contestazione.dataInvio ? new Date(contestazione.dataInvio).toISOString().slice(0, 10) : "",
      noteEsito: contestazione.noteEsito ?? "",
    });
    setModificaMode(true);
  }

  async function salvaModifica() {
    const res = await fetch(`/api/contestazioni/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oggetto: formModifica.oggetto,
        descrizione: formModifica.descrizione || null,
        gestore: formModifica.gestore || undefined,
        dataInvio: formModifica.dataInvio ? new Date(formModifica.dataInvio).toISOString() : null,
        noteEsito: formModifica.noteEsito || null,
      }),
    });
    if (res.ok) {
      const aggiornata = await res.json();
      setContestazione(c => c ? { ...c, ...aggiornata } : c);
      setModificaMode(false);
    }
  }

  async function eliminaContestazione() {
    if (!confirm(`Eliminare definitivamente "${contestazione?.oggetto}"?\n\nL'operazione non è reversibile.`)) return;
    const res = await fetch(`/api/contestazioni/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard/contestazioni");
    else alert("Errore durante l'eliminazione");
  }

  async function caricaDocumento(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file, file.name);
    const res = await fetch(`/api/contestazioni/${id}/documenti`, { method: "POST", body: formData });
    if (res.ok) {
      const documento = await res.json();
      setContestazione(c => c ? { ...c, documenti: [...c.documenti, documento] } : c);
    } else {
      const err = await res.json();
      alert(err.error ?? "Errore upload");
    }
    setUploading(false);
    e.target.value = "";
  }

  async function eliminaDocumento(documentoId: string) {
    if (!confirm("Eliminare questo documento?")) return;
    const res = await fetch(`/api/contestazioni/${id}/documenti`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentoId }),
    });
    if (res.ok) setContestazione(c => c ? { ...c, documenti: c.documenti.filter(d => d.id !== documentoId) } : c);
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Caricamento…</div>;
  if (!contestazione) return <div className="text-center py-12 text-gray-400">Contestazione non trovata</div>;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-lg">←</button>
        <h1 className="text-lg font-bold text-gray-900 flex-1 min-w-0 truncate">{contestazione.oggetto}</h1>
        <button onClick={apriModifica} className="text-xs text-blue-600 hover:underline shrink-0">✏️ Modifica</button>
        <button onClick={eliminaContestazione} className="text-xs text-red-500 hover:underline shrink-0">🗑️ Elimina</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ESITO_COLORE[contestazione.esito]}`}>
          {ESITO_LABEL[contestazione.esito]}
        </span>
        <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
          {GESTORE_LABEL[contestazione.gestore]}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
        {contestazione.descrizione && <p className="text-gray-700">{contestazione.descrizione}</p>}
        {contestazione.dataInvio && (
          <p className="text-gray-500">📅 Inviata il {new Date(contestazione.dataInvio).toLocaleDateString("it-IT")}</p>
        )}
        <p className="text-gray-400 text-xs">
          Creata il {new Date(contestazione.createdAt).toLocaleDateString("it-IT")}
        </p>
      </div>

      {/* Cambio esito */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="font-medium text-gray-700 mb-3 text-sm">Esito</p>
        <div className="grid grid-cols-2 gap-2">
          {ESITI.map(es => (
            <button
              key={es}
              onClick={() => cambiaEsito(es)}
              disabled={es === contestazione.esito}
              className={`text-xs py-2 px-3 rounded-lg border-2 font-medium transition-colors ${
                es === contestazione.esito
                  ? `${ESITO_COLORE[es]} border-transparent`
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {ESITO_LABEL[es]}
            </button>
          ))}
        </div>
        {contestazione.noteEsito && (
          <p className="text-xs text-gray-500 mt-3 italic">📝 {contestazione.noteEsito}</p>
        )}
      </div>

      {/* Documenti */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium text-gray-700 text-sm">Documenti {contestazione.documenti.length > 0 && `(${contestazione.documenti.length})`}</p>
          <label className={`text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg cursor-pointer ${uploading ? "opacity-50" : "hover:bg-blue-700"}`}>
            {uploading ? "Caricamento…" : "📎 Aggiungi"}
            <input type="file" className="hidden" onChange={caricaDocumento} disabled={uploading} />
          </label>
        </div>
        {contestazione.documenti.length === 0 ? (
          <p className="text-xs text-gray-400">Nessun documento</p>
        ) : (
          <div className="space-y-2">
            {contestazione.documenti.map(d => (
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

      {/* Popup modifica */}
      {modificaMode && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-lg space-y-3 shadow-xl">
            <p className="font-medium text-gray-800">✏️ Modifica contestazione</p>
            <div>
              <label className="text-xs text-gray-500">Oggetto</label>
              <input
                value={formModifica.oggetto}
                onChange={e => setFormModifica(f => ({ ...f, oggetto: e.target.value }))}
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
              <label className="text-xs text-gray-500">Gestore</label>
              <select
                value={formModifica.gestore}
                onChange={e => setFormModifica(f => ({ ...f, gestore: e.target.value as Gestore | "" }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(Object.keys(GESTORE_LABEL) as Gestore[]).map(g => (
                  <option key={g} value={g}>{GESTORE_LABEL[g]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Data invio</label>
              <input
                type="date"
                value={formModifica.dataInvio}
                onChange={e => setFormModifica(f => ({ ...f, dataInvio: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Note esito</label>
              <textarea
                value={formModifica.noteEsito}
                onChange={e => setFormModifica(f => ({ ...f, noteEsito: e.target.value }))}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500 resize"
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
    </div>
  );
}
