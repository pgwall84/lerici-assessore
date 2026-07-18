"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import type { AttoPoliticoAmministrativo, DocumentoAtto, RuoloDocumento, StatoAtto, TipoAtto } from "@prisma/client";

const TIPO_LABEL: Record<TipoAtto, string> = {
  CONVOCAZIONE_GIUNTA: "Convocazione Giunta",
  CONVOCAZIONE_CONSIGLIO: "Convocazione Consiglio",
  CONVOCAZIONE_COMMISSIONE: "Convocazione Commissione",
  MOZIONE: "Mozione",
  INTERROGAZIONE: "Interrogazione",
};

const STATO_LABEL: Record<StatoAtto, string> = {
  DA_ESAMINARE: "Da esaminare",
  ESAMINATO: "Esaminato",
  RISPOSTO: "Risposto",
  ARCHIVIATO: "Archiviato",
};

const STATO_COLORE: Record<StatoAtto, string> = {
  DA_ESAMINARE: "bg-yellow-100 text-yellow-800",
  ESAMINATO: "bg-blue-100 text-blue-700",
  RISPOSTO: "bg-green-100 text-green-800",
  ARCHIVIATO: "bg-gray-100 text-gray-500",
};

const STATI: StatoAtto[] = ["DA_ESAMINARE", "ESAMINATO", "RISPOSTO", "ARCHIVIATO"];

const RUOLO_LABEL: Record<RuoloDocumento, string> = {
  ORDINE_GIORNO: "Ordine del giorno",
  PRATICA_ALLEGATA: "Pratica allegata",
};

type AttoFull = AttoPoliticoAmministrativo & {
  documenti: DocumentoAtto[];
  consiglioCollegato: { id: string; oggetto: string } | null;
};

export default function AttoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [atto, setAtto] = useState<AttoFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [ruoloUpload, setRuoloUpload] = useState<RuoloDocumento>("ORDINE_GIORNO");
  const [odgTesto, setOdgTesto] = useState("");
  const [salvandoOdg, setSalvandoOdg] = useState(false);
  const [riEstraendoId, setRiEstraendoId] = useState<string | null>(null);
  const [consigli, setConsigli] = useState<{ id: string; oggetto: string }[]>([]);
  const [modificaMode, setModificaMode] = useState(false);
  const [formModifica, setFormModifica] = useState({ oggetto: "", dataSeduta: "", scadenzaRisposta: "" });

  useEffect(() => {
    fetch(`/api/atti/${id}`)
      .then(r => r.json())
      .then(async (data: AttoFull) => {
        setAtto(data);
        setOdgTesto(data.odgTestoEstratto ?? "");
        setLoading(false);
        if (!data.visualizzato) {
          const res = await fetch(`/api/atti/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ visualizzato: true }),
          });
          if (res.ok) {
            const aggiornato = await res.json();
            setAtto(a => a ? { ...a, visualizzato: aggiornato.visualizzato, visualizzatoAt: aggiornato.visualizzatoAt } : a);
          }
        }
      })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (atto?.tipo === "MOZIONE" || atto?.tipo === "INTERROGAZIONE") {
      fetch("/api/atti?tipo=CONVOCAZIONE_CONSIGLIO")
        .then(r => r.json())
        .then(setConsigli)
        .catch(() => {});
    }
  }, [atto?.tipo]);

  async function cambiaStato(stato: StatoAtto) {
    const res = await fetch(`/api/atti/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato }),
    });
    if (res.ok) {
      const aggiornato = await res.json();
      setAtto(a => a ? { ...a, stato: aggiornato.stato } : a);
    }
  }

  async function collegaConsiglio(consiglioCollegatoId: string) {
    const res = await fetch(`/api/atti/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consiglioCollegatoId: consiglioCollegatoId || null }),
    });
    if (res.ok) {
      const aggiornato = await res.json();
      setAtto(a => a ? { ...a, consiglioCollegato: aggiornato.consiglioCollegato } : a);
    }
  }

  function apriModifica() {
    if (!atto) return;
    setFormModifica({
      oggetto: atto.oggetto,
      dataSeduta: atto.dataSeduta ? new Date(atto.dataSeduta).toISOString().slice(0, 10) : "",
      scadenzaRisposta: atto.scadenzaRisposta ? new Date(atto.scadenzaRisposta).toISOString().slice(0, 10) : "",
    });
    setModificaMode(true);
  }

  async function salvaModifica() {
    const res = await fetch(`/api/atti/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oggetto: formModifica.oggetto,
        dataSeduta: formModifica.dataSeduta ? new Date(formModifica.dataSeduta).toISOString() : null,
        scadenzaRisposta: formModifica.scadenzaRisposta ? new Date(formModifica.scadenzaRisposta).toISOString() : null,
      }),
    });
    if (res.ok) {
      const aggiornato = await res.json();
      setAtto(a => a ? { ...a, ...aggiornato } : a);
      setModificaMode(false);
    }
  }

  async function eliminaAtto() {
    if (!confirm(`Eliminare definitivamente "${atto?.oggetto}"?\n\nL'operazione non è reversibile.`)) return;
    const res = await fetch(`/api/atti/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard/politica");
    else alert("Errore durante l'eliminazione");
  }

  async function caricaDocumento(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("ruolo", ruoloUpload);
    const res = await fetch(`/api/atti/${id}/documenti`, { method: "POST", body: formData });
    if (res.ok) {
      const { odgAvviso } = await res.json();
      // Ricarica sempre l'atto intero: copre sia il caso singolo file sia lo zip (più documenti)
      // e prende l'odgTestoEstratto aggiornato se l'estrazione automatica è partita.
      const r = await fetch(`/api/atti/${id}`);
      if (r.ok) { const fresh = await r.json(); setAtto(fresh); setOdgTesto(fresh.odgTestoEstratto ?? ""); }
      if (odgAvviso) alert(odgAvviso);
    } else {
      const err = await res.json();
      alert(err.error ?? "Errore upload");
    }
    setUploading(false);
    e.target.value = "";
  }

  async function eliminaDocumento(documentoId: string) {
    if (!confirm("Eliminare questo documento?")) return;
    const res = await fetch(`/api/atti/${id}/documenti`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentoId }),
    });
    if (res.ok) setAtto(a => a ? { ...a, documenti: a.documenti.filter(d => d.id !== documentoId) } : a);
  }

  async function riEstraiOdg(documentoId: string) {
    setRiEstraendoId(documentoId);
    const res = await fetch(`/api/atti/${id}/estrai-odg`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentoId }),
    });
    setRiEstraendoId(null);
    if (res.ok) {
      const aggiornato = await res.json();
      setAtto(aggiornato);
      setOdgTesto(aggiornato.odgTestoEstratto ?? "");
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Errore estrazione: ${err.error ?? res.status}`);
    }
  }

  async function salvaOdg() {
    setSalvandoOdg(true);
    const res = await fetch(`/api/atti/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ odgTestoEstratto: odgTesto || null }),
    });
    setSalvandoOdg(false);
    if (res.ok) {
      const aggiornato = await res.json();
      setAtto(a => a ? { ...a, odgTestoEstratto: aggiornato.odgTestoEstratto } : a);
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Caricamento…</div>;
  if (!atto) return <div className="text-center py-12 text-gray-400">Atto non trovato</div>;

  const mostraCollegamento = atto.tipo === "MOZIONE" || atto.tipo === "INTERROGAZIONE";

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-lg">←</button>
        <h1 className="text-lg font-bold text-gray-900 flex-1 min-w-0 truncate">{atto.oggetto}</h1>
        <button onClick={apriModifica} className="text-xs text-blue-600 hover:underline shrink-0">✏️ Modifica</button>
        <button onClick={eliminaAtto} className="text-xs text-red-500 hover:underline shrink-0">🗑️ Elimina</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATO_COLORE[atto.stato]}`}>
          {STATO_LABEL[atto.stato]}
        </span>
        <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
          {TIPO_LABEL[atto.tipo]}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
        {atto.dataSeduta && <p className="text-gray-700">📅 Seduta il {new Date(atto.dataSeduta).toLocaleDateString("it-IT")}</p>}
        {atto.scadenzaRisposta && <p className="text-gray-700">⏰ Risposta entro il {new Date(atto.scadenzaRisposta).toLocaleDateString("it-IT")}</p>}
        <p className="text-gray-400 text-xs">Creato il {new Date(atto.createdAt).toLocaleDateString("it-IT")}</p>
      </div>

      {/* Collegamento al Consiglio (Mozioni/Interrogazioni) */}
      {mostraCollegamento && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm space-y-2">
          <p className="font-medium text-gray-700">🔗 Consiglio collegato</p>
          <select
            value={atto.consiglioCollegato?.id ?? ""}
            onChange={e => collegaConsiglio(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— nessuno —</option>
            {consigli.map(c => (
              <option key={c.id} value={c.id}>{c.oggetto}</option>
            ))}
          </select>
        </div>
      )}

      {/* Cambio stato */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="font-medium text-gray-700 mb-3 text-sm">Cambia stato</p>
        <div className="grid grid-cols-2 gap-2">
          {STATI.map(s => (
            <button
              key={s}
              onClick={() => cambiaStato(s)}
              disabled={s === atto.stato}
              className={`text-xs py-2 px-3 rounded-lg border-2 font-medium transition-colors ${
                s === atto.stato ? `${STATO_COLORE[s]} border-transparent` : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {STATO_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Documenti */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="font-medium text-gray-700 text-sm">Documenti {atto.documenti.length > 0 && `(${atto.documenti.length})`}</p>
          <div className="flex items-center gap-1.5">
            <select
              value={ruoloUpload}
              onChange={e => setRuoloUpload(e.target.value as RuoloDocumento)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
            >
              <option value="ORDINE_GIORNO">Ordine del giorno</option>
              <option value="PRATICA_ALLEGATA">Pratica allegata</option>
            </select>
            <label className={`text-xs bg-blue-600 text-white px-2.5 py-1.5 rounded-lg cursor-pointer ${uploading ? "opacity-50" : "hover:bg-blue-700"}`}>
              {uploading ? "Caricamento…" : "📎 Aggiungi"}
              <input type="file" accept=".pdf,.docx,.rtf,.zip,image/*" className="hidden" onChange={caricaDocumento} disabled={uploading} />
            </label>
          </div>
        </div>
        {atto.documenti.length === 0 ? (
          <p className="text-xs text-gray-400">Nessun documento</p>
        ) : (
          <div className="space-y-2">
            {atto.documenti.map(d => (
              <div key={d.id} className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-2">
                <a href={d.storageUrl} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-sm text-blue-700 truncate hover:underline">
                  📄 {d.nomeFile}
                </a>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">{RUOLO_LABEL[d.ruolo]}</span>
                <button
                  onClick={() => riEstraiOdg(d.id)}
                  disabled={riEstraendoId === d.id}
                  className="text-xs text-blue-600 hover:underline shrink-0 disabled:opacity-50"
                >
                  {riEstraendoId === d.id ? "…" : d.ruolo === "ORDINE_GIORNO" ? "🔄 Estrai" : "Estrai come ODG"}
                </button>
                <button onClick={() => eliminaDocumento(d.id)} className="text-xs text-red-500 hover:underline shrink-0">
                  Elimina
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ODG estratto */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="font-medium text-gray-700 mb-2 text-sm">📋 Ordine del giorno</p>
        <textarea
          value={odgTesto}
          onChange={e => setOdgTesto(e.target.value)}
          rows={8}
          placeholder="Vuoto — carica un documento come «Ordine del giorno» per estrarlo automaticamente, oppure scrivilo qui a mano."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize"
        />
        <button
          onClick={salvaOdg}
          disabled={salvandoOdg}
          className="mt-2 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-blue-700"
        >
          {salvandoOdg ? "Salvataggio…" : "Salva"}
        </button>
      </div>

      {/* Popup modifica */}
      {modificaMode && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-lg space-y-3 shadow-xl">
            <p className="font-medium text-gray-800">✏️ Modifica atto</p>
            <div>
              <label className="text-xs text-gray-500">Oggetto</label>
              <input
                value={formModifica.oggetto}
                onChange={e => setFormModifica(f => ({ ...f, oggetto: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Data seduta</label>
              <input
                type="date"
                value={formModifica.dataSeduta}
                onChange={e => setFormModifica(f => ({ ...f, dataSeduta: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {mostraCollegamento && (
              <div>
                <label className="text-xs text-gray-500">Scadenza risposta</label>
                <input
                  type="date"
                  value={formModifica.scadenzaRisposta}
                  onChange={e => setFormModifica(f => ({ ...f, scadenzaRisposta: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
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
