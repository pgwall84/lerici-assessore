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
  const [inviando, setInviando] = useState<string | null>(null);
  const [tab, setTab] = useState<"daInoltrare" | "inoltrate">("daInoltrare");

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

  async function invia(g: GiustificaCard, e: React.MouseEvent) {
    e.stopPropagation();
    if (inviando) return;
    setInviando(g.id);
    try {
      const res = await fetch(`/api/giustifiche/${g.id}/inoltra`, { method: "POST" });
      if (res.ok) {
        const aggiornata = await res.json();
        setGiustifiche(gs => gs.map(x => x.id === g.id ? { ...x, inoltrata: aggiornata.inoltrata, inoltrataAt: aggiornata.inoltrataAt } : x));
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Errore invio email");
      }
    } finally {
      setInviando(null);
    }
  }

  async function annullaInoltro(g: GiustificaCard, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Segnare di nuovo come da inoltrare?")) return;
    const res = await fetch(`/api/giustifiche/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inoltrata: false }),
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
  const totaleDaInoltrare = giustifiche.filter(g => !g.inoltrata).length;
  const totaleInoltrate = giustifiche.filter(g => g.inoltrata).length;
  const giustificheVista = giustifiche.filter(g => tab === "daInoltrare" ? !g.inoltrata : g.inoltrata);

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

      {daVedere > 0 && (
        <div className="flex gap-2">
          <span className="text-xs px-3 py-1.5 rounded-full bg-red-100 text-red-700 font-medium">
            🔴 {daVedere} da vedere
          </span>
        </div>
      )}

      {/* Tab Da inoltrare / Inoltrate */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("daInoltrare")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors
            ${tab === "daInoltrare" ? "bg-blue-600 text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
        >
          ✉️ Da inoltrare
          <span className={`ml-2 text-xs font-mono ${tab === "daInoltrare" ? "text-blue-200" : "text-gray-400"}`}>
            {totaleDaInoltrare}
          </span>
        </button>
        <button
          onClick={() => setTab("inoltrate")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors
            ${tab === "inoltrate" ? "bg-gray-700 text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
        >
          ✓ Inoltrate
          <span className={`ml-2 text-xs font-mono ${tab === "inoltrate" ? "text-gray-300" : "text-gray-400"}`}>
            {totaleInoltrate}
          </span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Caricamento…</div>
      ) : giustificheVista.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📝</p>
          <p>{tab === "daInoltrare" ? "Nessuna giustifica da inoltrare" : "Nessuna giustifica inoltrata"}</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {giustificheVista.map(g => (
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
                {g.inoltrata ? (
                  <button
                    onClick={e => annullaInoltro(g, e)}
                    className="shrink-0 text-xs px-2.5 py-1 rounded-full font-medium bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                  >
                    ✓ Inoltrata
                  </button>
                ) : (
                  <button
                    onClick={e => invia(g, e)}
                    disabled={inviando === g.id}
                    className="shrink-0 text-xs px-2.5 py-1 rounded-full font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {inviando === g.id ? "Invio…" : "📧 Invia"}
                  </button>
                )}
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
