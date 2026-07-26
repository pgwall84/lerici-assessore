"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { TIPO_ATTO_LABEL, STATO_ATTO_LABEL, STATO_ATTO_COLORE, PRIORITA_LABEL } from "@/lib/constants";
import { PrioritaBadge } from "@/components/PrioritaBadge";
import { MailOriginaleButton } from "@/components/MailOriginaleButton";
import { ReferenteBox } from "@/components/ReferenteBox";
import type { AttoPoliticoAmministrativo, DocumentoAtto, NotaAtto, Priorita, RuoloDocumento, StatoAtto } from "@prisma/client";

const TIPO_LABEL = TIPO_ATTO_LABEL;
const STATO_LABEL = STATO_ATTO_LABEL;
const STATO_COLORE = STATO_ATTO_COLORE;

const STATI: StatoAtto[] = ["DA_ESAMINARE", "ESAMINATO", "RISPOSTO", "ARCHIVIATO"];

const RUOLO_LABEL: Record<RuoloDocumento, string> = {
  ORDINE_GIORNO: "Ordine del giorno",
  PRATICA_ALLEGATA: "Pratica allegata",
};

type AttoFull = AttoPoliticoAmministrativo & {
  documenti: DocumentoAtto[];
  note: NotaAtto[];
  consiglioCollegato: { id: string; oggetto: string } | null;
  responsabile: { id: number; nome: string; cognome: string; ruolo: string | null; telefono: string | null; email: string | null } | null;
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
  const [corpoTesto, setCorpoTesto] = useState("");
  const [salvandoCorpo, setSalvandoCorpo] = useState(false);
  const [riEstraendoId, setRiEstraendoId] = useState<string | null>(null);
  const [consigli, setConsigli] = useState<{ id: string; oggetto: string }[]>([]);
  const [modificaMode, setModificaMode] = useState(false);
  const [formModifica, setFormModifica] = useState({ oggetto: "", dataSeduta: "", scadenzaRisposta: "", priorita: "" as Priorita | "", responsabileId: "" as string });
  const [persone, setPersone] = useState<{ id: number; nome: string; cognome: string; ruolo: string | null }[]>([]);
  const [nuovaNota, setNuovaNota] = useState("");
  const [savingNota, setSavingNota] = useState(false);

  useEffect(() => {
    fetch(`/api/atti/${id}`)
      .then(r => r.json())
      .then(async (data: AttoFull) => {
        setAtto(data);
        setOdgTesto(data.odgTestoEstratto ?? "");
        setCorpoTesto(data.corpoTestoEstratto ?? "");
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
    fetch("/api/persone").then(r => r.json()).then(setPersone).catch(() => {});
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
      priorita: atto.priorita ?? "",
      responsabileId: atto.responsabileId ? String(atto.responsabileId) : "",
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
        priorita: formModifica.priorita || null,
        responsabileId: formModifica.responsabileId ? Number(formModifica.responsabileId) : null,
      }),
    });
    if (res.ok) {
      const aggiornato = await res.json();
      setAtto(a => a ? { ...a, ...aggiornato } : a);
      setModificaMode(false);
    }
  }

  async function assegnaReferente(responsabileId: number) {
    const res = await fetch(`/api/atti/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responsabileId }),
    });
    if (res.ok) {
      const aggiornato = await res.json();
      setAtto(a => a ? { ...a, responsabile: aggiornato.responsabile, responsabileId: aggiornato.responsabileId } : a);
    }
  }

  async function inviaEmail(destinatario: string) {
    const res = await fetch(`/api/atti/${id}/notifica`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canale: "email", destinatario }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Errore invio email: ${err.error ?? res.status}`);
    }
  }

  async function inviaTelegram() {
    const res = await fetch(`/api/atti/${id}/notifica`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canale: "telegram" }),
    });
    if (!res.ok) alert("Errore invio");
  }

  function apriWhatsApp() {
    if (!atto) return;
    const righe = [
      `🏛️ ${atto.oggetto}`,
      ``,
      `🏷 ${TIPO_LABEL[atto.tipo]}`,
      `📊 Stato: ${STATO_LABEL[atto.stato]}`,
    ];
    if (atto.dataSeduta) righe.push(`📅 Seduta il ${new Date(atto.dataSeduta).toLocaleDateString("it-IT")}`);
    if (atto.responsabile) {
      righe.push(``, `📌 Responsabile: ${atto.responsabile.nome} ${atto.responsabile.cognome}`);
      if (atto.responsabile.ruolo) righe.push(`   ${atto.responsabile.ruolo}`);
      if (atto.responsabile.telefono) righe.push(`   📞 ${atto.responsabile.telefono}`);
    }
    if (atto.note.length > 0) righe.push(``, `📝 ${atto.note[atto.note.length - 1].testo}`);
    righe.push(``, `🔗 Atto #${atto.id}`);

    const testo = righe.join("\n");
    const numero = atto.responsabile?.telefono?.replace(/\D/g, "") ?? "";
    const encoded = encodeURIComponent(testo);
    const url = numero
      ? `whatsapp://send?phone=${numero}&text=${encoded}`
      : `whatsapp://send?text=${encoded}`;
    window.location.href = url;
  }

  async function aggiungiNota() {
    if (!nuovaNota.trim()) return;
    setSavingNota(true);
    const res = await fetch(`/api/atti/${id}/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testo: nuovaNota.trim() }),
    });
    if (res.ok) {
      const nota = await res.json();
      setAtto(a => a ? { ...a, note: [...a.note, nota] } : a);
      setNuovaNota("");
    }
    setSavingNota(false);
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

  async function salvaCorpo() {
    setSalvandoCorpo(true);
    const res = await fetch(`/api/atti/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corpoTestoEstratto: corpoTesto || null }),
    });
    setSalvandoCorpo(false);
    if (res.ok) {
      const aggiornato = await res.json();
      setAtto(a => a ? { ...a, corpoTestoEstratto: aggiornato.corpoTestoEstratto } : a);
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
        <PrioritaBadge priorita={atto.priorita} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
        {atto.dataSeduta && <p className="text-gray-700">📅 Seduta il {new Date(atto.dataSeduta).toLocaleDateString("it-IT")}</p>}
        {atto.scadenzaRisposta && <p className="text-gray-700">⏰ Risposta entro il {new Date(atto.scadenzaRisposta).toLocaleDateString("it-IT")}</p>}
        <p className="text-gray-400 text-xs">Creato il {new Date(atto.createdAt).toLocaleDateString("it-IT")}</p>
        <MailOriginaleButton messageId={atto.messageId} />
      </div>

      {/* Responsabile */}
      <ReferenteBox
        responsabile={atto.responsabile}
        persone={persone}
        onAssegna={assegnaReferente}
        onInviaTelegram={inviaTelegram}
        onInviaEmail={inviaEmail}
        onWhatsApp={apriWhatsApp}
      />

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

      {/* Testo estratto dal corpo mail — fallback per Mozioni/Interrogazioni senza PDF/DOCX
          allegato, unico posto dove il testo esiste quando non c'è un documento scaricabile */}
      {(atto.tipo === "MOZIONE" || atto.tipo === "INTERROGAZIONE") && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="font-medium text-gray-700 mb-2 text-sm">📄 Testo (dal corpo della mail)</p>
          <textarea
            value={corpoTesto}
            onChange={e => setCorpoTesto(e.target.value)}
            rows={10}
            placeholder="Vuoto — nessun documento allegato e il corpo della mail non conteneva testo sostanziale, oppure scrivilo qui a mano."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize"
          />
          <button
            onClick={salvaCorpo}
            disabled={salvandoCorpo}
            className="mt-2 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 hover:bg-blue-700"
          >
            {salvandoCorpo ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      )}

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
          {atto.note.length === 0 && (
            <p className="text-xs text-gray-400">Nessun aggiornamento ancora</p>
          )}
          {[...atto.note].reverse().map((n, i) => (
            <div key={n.id} className={`rounded-lg px-3 py-2 border-l-2 ${i === 0 ? "bg-blue-50 border-blue-400" : "bg-gray-50 border-gray-200"}`}>
              <p className="text-sm text-gray-800">{n.testo}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(n.createdAt).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          ))}
        </div>
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
            <div>
              <label className="text-xs text-gray-500">Responsabile</label>
              <select
                value={formModifica.responsabileId}
                onChange={e => setFormModifica(f => ({ ...f, responsabileId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— nessuno —</option>
                {persone.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nome} {p.cognome}{p.ruolo ? ` — ${p.ruolo}` : ""}
                  </option>
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
