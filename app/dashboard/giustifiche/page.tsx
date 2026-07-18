"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DocumentoGiustifica, Giustifica } from "@prisma/client";

type GiustificaCard = Giustifica & { documenti: DocumentoGiustifica[] };

export default function GiustifichePage() {
  const [giustifiche, setGiustifiche] = useState<GiustificaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [espansa, setEspansa] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    carica();
  }, []);

  function carica() {
    fetch("/api/giustifiche")
      .then(r => r.json())
      .then(data => { setGiustifiche(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  async function espandi(g: GiustificaCard) {
    const apri = espansa !== g.id;
    setEspansa(apri ? g.id : null);
    if (apri && !g.visualizzata) {
      const res = await fetch(`/api/giustifiche/${g.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visualizzata: true }),
      });
      if (res.ok) {
        const aggiornata = await res.json();
        setGiustifiche(gs => gs.map(x => x.id === g.id ? { ...x, visualizzata: aggiornata.visualizzata, visualizzataAt: aggiornata.visualizzataAt } : x));
      }
    }
  }

  async function toggleInoltrata(g: GiustificaCard, e: React.MouseEvent) {
    e.stopPropagation();
    const res = await fetch(`/api/giustifiche/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inoltrata: !g.inoltrata }),
    });
    if (res.ok) {
      const aggiornata = await res.json();
      setGiustifiche(gs => gs.map(x => x.id === g.id ? { ...x, inoltrata: aggiornata.inoltrata, inoltrataAt: aggiornata.inoltrataAt } : x));
    }
  }

  async function eliminaGiustifica(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Eliminare questa giustifica?")) return;
    const res = await fetch(`/api/giustifiche/${id}`, { method: "DELETE" });
    if (res.ok) setGiustifiche(gs => gs.filter(g => g.id !== id));
  }

  async function caricaDocumento(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file, file.name);
    const res = await fetch(`/api/giustifiche/${id}/documenti`, { method: "POST", body: formData });
    if (res.ok) {
      const documento = await res.json();
      setGiustifiche(gs => gs.map(g => g.id === id ? { ...g, documenti: [...g.documenti, documento] } : g));
    } else {
      const err = await res.json();
      alert(err.error ?? "Errore upload");
    }
    setUploading(false);
    e.target.value = "";
  }

  async function eliminaDocumento(id: string, documentoId: string) {
    if (!confirm("Eliminare questo documento?")) return;
    const res = await fetch(`/api/giustifiche/${id}/documenti`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentoId }),
    });
    if (res.ok) setGiustifiche(gs => gs.map(g => g.id === id ? { ...g, documenti: g.documenti.filter(d => d.id !== documentoId) } : g));
  }

  const daVedere = giustifiche.filter(g => !g.visualizzata).length;
  const daInoltrare = giustifiche.filter(g => g.visualizzata && !g.inoltrata).length;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">📝 Giustifiche</h1>
        <Link
          href="/dashboard/giustifiche/nuova"
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
        >
          + Nuova
        </Link>
      </div>

      {(daVedere > 0 || daInoltrare > 0) && (
        <div className="flex gap-2">
          {daVedere > 0 && (
            <span className="text-xs px-3 py-1.5 rounded-full bg-red-100 text-red-700 font-medium">
              🔴 {daVedere} da vedere
            </span>
          )}
          {daInoltrare > 0 && (
            <span className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 font-medium">
              {daInoltrare} da inoltrare
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Caricamento…</div>
      ) : giustifiche.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📝</p>
          <p>Nessuna giustifica ancora</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {giustifiche.map(g => (
            <div key={g.id}>
              <button
                onClick={() => espandi(g)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                {!g.visualizzata && <span className="shrink-0 mt-1.5 w-2 h-2 rounded-full bg-red-500" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{g.oggetto}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {g.ufficioMittente && <span>{g.ufficioMittente} · </span>}
                    {new Date(g.dataRicezione).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
                <button
                  onClick={e => toggleInoltrata(g, e)}
                  className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    g.inoltrata ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {g.inoltrata ? "✓ Inoltrata" : "Da inoltrare"}
                </button>
              </button>

              {espansa === g.id && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-3">
                  {g.inoltrataAt && (
                    <p className="text-xs text-gray-500">Inoltrata il {new Date(g.inoltrataAt).toLocaleDateString("it-IT")}</p>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-700">Documenti {g.documenti.length > 0 && `(${g.documenti.length})`}</p>
                      <label className={`text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg cursor-pointer ${uploading ? "opacity-50" : "hover:bg-blue-700"}`}>
                        {uploading ? "Caricamento…" : "📎 Aggiungi"}
                        <input type="file" className="hidden" onChange={e => caricaDocumento(g.id, e)} disabled={uploading} />
                      </label>
                    </div>
                    {g.documenti.length === 0 ? (
                      <p className="text-xs text-gray-400">Nessun documento</p>
                    ) : (
                      <div className="space-y-1.5">
                        {g.documenti.map(d => (
                          <div key={d.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-2.5 py-1.5">
                            <a href={d.storageUrl} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-xs text-blue-700 truncate hover:underline">
                              📄 {d.nomeFile}
                            </a>
                            <button onClick={() => eliminaDocumento(g.id, d.id)} className="text-xs text-red-500 hover:underline shrink-0">
                              Elimina
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={e => eliminaGiustifica(g.id, e)} className="text-xs text-red-500 hover:underline">
                    🗑️ Elimina giustifica
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
