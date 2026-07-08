"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  DELEGHE_LABEL, STATO_COLORE, STATO_INIZIALE, STATO_LABEL, STATI_PER_TIPO,
  TIPO_COLORE, TIPO_LABEL
} from "@/lib/constants";
import type { Appuntamento, Delega, Foto, MailInviata, Nota, Pratica, StatoPratica, StoricoStato, TipoPratica } from "@prisma/client";

type PraticaFull = Pratica & {
  persona: { id: number; nome: string; cognome: string; ruolo: string | null; telefono: string | null; email: string | null } | null;
  segnalante: { nome: string | null; telefono: string | null; email: string | null } | null;
  foto: Foto[];
  note: Nota[];
  storico: StoricoStato[];
  appuntamenti: Appuntamento[];
  mailInviate: MailInviata[];
};

export default function PraticaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [pratica, setPratica] = useState<PraticaFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [nuovaNota, setNuovaNota] = useState("");
  const [savingNota, setSavingNota] = useState(false);
  const [nuovoStato, setNuovoStato] = useState<StatoPratica | "">("");
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [fotoIngrandita, setFotoIngrandita] = useState<string | null>(null);
  const [persone, setPersone] = useState<{ id: number; nome: string; cognome: string; ruolo: string | null }[]>([]);
  const [assegnaMode, setAssegnaMode] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [inviando, setInviando] = useState<string | null>(null);
  const [emailPopup, setEmailPopup] = useState(false);
  const [emailDest, setEmailDest] = useState("");
  const [modificaMode, setModificaMode] = useState(false);
  const [formModifica, setFormModifica] = useState({ titolo: "", descrizione: "", luogo: "", priorita: "MEDIA", delega: "", tipo: "SEGNALAZIONE", stato: "APERTA" });
  const [promozionePopup, setPromozionePopup] = useState(false);
  const [formProgetto, setFormProgetto] = useState({ titolo: "", descrizione: "" });
  const [showAppForm, setShowAppForm] = useState(false);
  const [formApp, setFormApp] = useState({ titolo: "", dataOra: "", luogo: "", descrizione: "" });
  const [savingApp, setSavingApp] = useState(false);
  const [rispondiPopup, setRispondiPopup] = useState(false);
  const [rispondiExpanded, setRispondiExpanded] = useState(false);
  const [formRispondi, setFormRispondi] = useState({ oggetto: "", corpo: "" });
  const [inviandoRisposta, setInviandoRisposta] = useState(false);
  const [mailAperta, setMailAperta] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/pratiche/${id}`)
      .then(r => r.json())
      .then(data => { setPratica(data); setLoading(false); })
      .catch(() => setLoading(false));
    fetch("/api/persone")
      .then(r => r.json())
      .then(setPersone)
      .catch(() => {});
  }, [id]);

  async function cambiaStato(stato: StatoPratica) {
    const res = await fetch(`/api/pratiche/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato }),
    });
    if (res.ok) {
      const aggiornata = await res.json();
      setPratica(p => p ? { ...p, stato: aggiornata.stato, chiusaAt: aggiornata.chiusaAt } : p);
      setNuovoStato("");
      if (stato === "PROMOSSA" && pratica?.tipo === "MIA_IDEA") {
        setFormProgetto({ titolo: pratica.titolo, descrizione: pratica.descrizione ?? "" });
        setPromozionePopup(true);
      }
    }
  }

  function apriModifica() {
    if (!pratica) return;
    setFormModifica({
      titolo: pratica.titolo,
      descrizione: pratica.descrizione ?? "",
      luogo: pratica.luogo ?? "",
      priorita: pratica.priorita,
      delega: pratica.delega,
      tipo: pratica.tipo,
      stato: pratica.stato,
    });
    setModificaMode(true);
  }

  async function salvaModifica() {
    const res = await fetch(`/api/pratiche/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titolo: formModifica.titolo,
        descrizione: formModifica.descrizione || null,
        luogo: formModifica.luogo || null,
        priorita: formModifica.priorita,
        delega: formModifica.delega,
        tipo: formModifica.tipo,
        stato: formModifica.stato,
      }),
    });
    if (res.ok) {
      const aggiornata = await res.json();
      setPratica(p => p ? { ...p, ...aggiornata } : p);
      setModificaMode(false);
    }
  }

  async function aggiungiAppuntamento(e: React.FormEvent) {
    e.preventDefault();
    setSavingApp(true);
    const res = await fetch("/api/appuntamenti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titolo: formApp.titolo,
        dataOra: new Date(formApp.dataOra).toISOString(),
        luogo: formApp.luogo || undefined,
        descrizione: formApp.descrizione || undefined,
        praticaId: Number(id),
      }),
    });
    if (res.ok) {
      const a = await res.json();
      setPratica(p => p ? { ...p, appuntamenti: [...p.appuntamenti, a].sort((x, y) => new Date(x.dataOra).getTime() - new Date(y.dataOra).getTime()) } : p);
      setFormApp({ titolo: "", dataOra: "", luogo: "", descrizione: "" });
      setShowAppForm(false);
    }
    setSavingApp(false);
  }

  async function creaProgettoDaIdea() {
    const res = await fetch("/api/pratiche", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "PROGETTO",
        delega: pratica!.delega,
        titolo: formProgetto.titolo,
        descrizione: formProgetto.descrizione || undefined,
        priorita: pratica!.priorita,
        personaId: pratica!.persona?.id,
      }),
    });
    if (res.ok) {
      const nuovo = await res.json();
      // Archivia l'idea con nota
      await fetch(`/api/pratiche/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: "ARCHIVIATA" }),
      });
      await fetch(`/api/pratiche/${id}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testo: `Promossa a progetto #${nuovo.id}: ${formProgetto.titolo}` }),
      });
      setPromozionePopup(false);
      router.push(`/dashboard/pratica/${nuovo.id}`);
    }
  }

  async function aggiungiNota() {
    if (!nuovaNota.trim()) return;
    setSavingNota(true);
    const res = await fetch(`/api/pratiche/${id}/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testo: nuovaNota.trim() }),
    });
    if (res.ok) {
      const nota = await res.json();
      setPratica(p => p ? { ...p, note: [...p.note, nota] } : p);
      setNuovaNota("");
    }
    setSavingNota(false);
  }

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

  async function caricaFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFoto(true);
    const blob = await comprimi(file);
    const formData = new FormData();
    formData.append("foto", blob, "foto.jpg");
    const res = await fetch(`/api/pratiche/${id}/foto`, { method: "POST", body: formData });
    if (res.ok) {
      const foto = await res.json();
      setPratica(p => p ? { ...p, foto: [...p.foto, foto] } : p);
    } else {
      const err = await res.json();
      alert(err.error ?? "Errore upload");
    }
    setUploadingFoto(false);
    e.target.value = "";
  }

  function apriRispondi() {
    if (!pratica) return;
    setFormRispondi({
      oggetto: `Re: ${pratica.titolo}`,
      corpo: `Gentile ${pratica.segnalante?.nome ?? "Cittadino"},\n\n`,
    });
    setRispondiPopup(true);
  }

  async function inviaRisposta() {
    if (!pratica?.segnalante?.email) return;
    setInviandoRisposta(true);
    const res = await fetch(`/api/pratiche/${id}/rispondi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: pratica.segnalante.email,
        oggetto: formRispondi.oggetto,
        corpo: formRispondi.corpo,
      }),
    });
    setInviandoRisposta(false);
    if (res.ok) {
      const { mailInviata } = await res.json();
      setPratica(p => p ? { ...p, mailInviate: [mailInviata, ...p.mailInviate] } : p);
      setRispondiPopup(false);
      setRispondiExpanded(false);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Errore invio: ${err.error ?? res.status}`);
    }
  }

  async function eliminaPratica() {
    if (!confirm(`Eliminare definitivamente "${pratica?.titolo}"?\n\nL'operazione non è reversibile.`)) return;
    const res = await fetch(`/api/pratiche/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard");
    else alert("Errore durante l'eliminazione");
  }

  async function eliminaFoto(fotoId: number) {
    if (!confirm("Eliminare questa foto?")) return;
    const res = await fetch(`/api/pratiche/${id}/foto`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fotoId }),
    });
    if (res.ok) setPratica(p => p ? { ...p, foto: p.foto.filter(f => f.id !== fotoId) } : p);
  }

  async function assegnaReferente() {
    if (!selectedPersonaId) return;
    const res = await fetch(`/api/pratiche/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personaId: Number(selectedPersonaId) }),
    });
    if (res.ok) {
      const aggiornata = await res.json();
      setPratica(p => p ? { ...p, persona: aggiornata.persona } : p);
      setAssegnaMode(false);
      setSelectedPersonaId("");
    }
  }

  function apriEmailPopup() {
    setEmailDest(pratica?.persona?.email ?? "");
    setEmailPopup(true);
  }

  async function inviaEmail() {
    if (!emailDest.trim()) return;
    setInviando("email");
    setEmailPopup(false);
    const res = await fetch(`/api/pratiche/${id}/notifica`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canale: "email", destinatario: emailDest.trim() }),
    });
    setInviando(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Errore invio email: ${err.error ?? res.status}`);
    }
  }

  async function inviaNotitica(canale: "telegram") {
    setInviando(canale);
    const res = await fetch(`/api/pratiche/${id}/notifica`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canale }),
    });
    setInviando(null);
    if (!res.ok) alert("Errore invio");
  }

  function apriWhatsApp() {
    if (!pratica) return;
    const righe = [
      `📋 ${pratica.titolo}`,
      ``,
      `🏷 ${TIPO_LABEL[pratica.tipo]} · ${DELEGHE_LABEL[pratica.delega]}`,
      `📊 Stato: ${STATO_LABEL[pratica.stato]}${pratica.priorita === "ALTA" ? " 🔴" : ""}`,
    ];
    if (pratica.luogo) righe.push(`📍 ${pratica.luogo}`);
    if (pratica.descrizione) righe.push(``, pratica.descrizione);
    if (pratica.segnalante?.nome) righe.push(``, `👤 Segnalante: ${pratica.segnalante.nome}${pratica.segnalante.telefono ? ` · ${pratica.segnalante.telefono}` : ""}`);
    if (pratica.persona) {
      righe.push(``, `📌 Referente: ${pratica.persona.nome} ${pratica.persona.cognome}`);
      if (pratica.persona.ruolo) righe.push(`   ${pratica.persona.ruolo}`);
      if (pratica.persona.telefono) righe.push(`   📞 ${pratica.persona.telefono}`);
    }
    if (pratica.note.length > 0) righe.push(``, `📝 ${pratica.note[pratica.note.length - 1].testo}`);
    righe.push(``, `🔗 Pratica #${pratica.id}`);

    const testo = righe.join("\n");
    const numero = pratica.persona?.telefono?.replace(/\D/g, "") ?? "";
    const encoded = encodeURIComponent(testo);
    const url = numero
      ? `whatsapp://send?phone=${numero}&text=${encoded}`
      : `whatsapp://send?text=${encoded}`;
    window.location.href = url;
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Caricamento…</div>;
  if (!pratica) return <div className="text-center py-12 text-gray-400">Pratica non trovata</div>;

  const statiDisponibili = STATI_PER_TIPO[pratica.tipo];

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-lg">←</button>
        <h1 className="text-lg font-bold text-gray-900 flex-1 min-w-0 truncate">{pratica.titolo}</h1>
        <button onClick={apriModifica} className="text-xs text-blue-600 hover:underline shrink-0">✏️ Modifica</button>
        <button onClick={eliminaPratica} className="text-xs text-red-500 hover:underline shrink-0">🗑️ Elimina</button>
      </div>

      {/* Badge */}
      <div className="flex flex-wrap gap-2">
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${TIPO_COLORE[pratica.tipo]}`}>
          {TIPO_LABEL[pratica.tipo]}
        </span>
        <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
          {DELEGHE_LABEL[pratica.delega]}
        </span>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATO_COLORE[pratica.stato]}`}>
          {STATO_LABEL[pratica.stato]}
        </span>
        {pratica.priorita !== "MEDIA" && (
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${pratica.priorita === "ALTA" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>
            {pratica.priorita === "ALTA" ? "🔴 Alta" : "⚪ Bassa"}
          </span>
        )}
      </div>

      {/* Info base */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
        {(pratica.protocollo || pratica.dataProtocollo) && (
          <p className="text-xs font-medium text-blue-700 bg-blue-50 rounded px-2 py-1 inline-block">
            Prot. {pratica.protocollo}{pratica.dataProtocollo ? ` del ${pratica.dataProtocollo}` : ""}
          </p>
        )}
        {pratica.descrizione && <p className="text-gray-700">{pratica.descrizione}</p>}
        {pratica.luogo && <p className="text-gray-500">📍 {pratica.luogo}</p>}
        <p className="text-gray-400 text-xs">
          Creata il {new Date(pratica.createdAt).toLocaleDateString("it-IT")}
          {pratica.chiusaAt && ` · Chiusa il ${new Date(pratica.chiusaAt).toLocaleDateString("it-IT")}`}
        </p>
      </div>

      {/* Segnalante */}
      {pratica.segnalante && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm">
          <p className="font-medium text-gray-700 mb-2">👤 Segnalante</p>
          {pratica.segnalante.nome && <p>{pratica.segnalante.nome}</p>}
          {pratica.segnalante.telefono && <p className="text-gray-500">{pratica.segnalante.telefono}</p>}
          {pratica.segnalante.email && (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-gray-500">{pratica.segnalante.email}</p>
              {pratica.messageId && (
                <button
                  onClick={apriRispondi}
                  className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-2 py-0.5 hover:bg-blue-100 shrink-0"
                >
                  ✉️ Rispondi
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Referente + Condivisione */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-gray-700">📋 Referente</p>
          <button
            onClick={() => setAssegnaMode(m => !m)}
            className="text-xs text-blue-600 hover:underline"
          >
            {pratica.persona ? "Cambia" : "+ Assegna"}
          </button>
        </div>

        {pratica.persona ? (
          <div>
            <p className="font-medium">{pratica.persona.nome} {pratica.persona.cognome}</p>
            {pratica.persona.ruolo && <p className="text-gray-500">{pratica.persona.ruolo}</p>}
            {pratica.persona.telefono && <p className="text-gray-500">{pratica.persona.telefono}</p>}
            {pratica.persona.email && <p className="text-gray-500">{pratica.persona.email}</p>}
          </div>
        ) : (
          <p className="text-gray-400 text-xs">Nessun referente assegnato</p>
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

        {/* Pulsanti condivisione — sempre visibili */}
        <div className="flex gap-2 pt-1 border-t border-gray-100">
          <button
            onClick={() => inviaNotitica("telegram")}
            disabled={inviando === "telegram"}
            className="flex-1 text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded-lg py-2 hover:bg-sky-100 disabled:opacity-50 transition-colors"
          >
            {inviando === "telegram" ? "…" : "✈️ Telegram"}
          </button>
          <button
            onClick={apriEmailPopup}
            disabled={inviando === "email"}
            className="flex-1 text-xs bg-gray-50 text-gray-700 border border-gray-200 rounded-lg py-2 hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            {inviando === "email" ? "…" : "📧 Email"}
          </button>
          <button
            onClick={apriWhatsApp}
            className="flex-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg py-2 hover:bg-green-100 transition-colors"
          >
            💬 WhatsApp
          </button>
        </div>
      </div>

      {/* Cambio stato */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="font-medium text-gray-700 mb-3 text-sm">Cambia stato</p>
        <div className="grid grid-cols-2 gap-2">
          {statiDisponibili.map(s => (
            <button
              key={s}
              onClick={() => cambiaStato(s)}
              disabled={s === pratica.stato}
              className={`text-xs py-2 px-3 rounded-lg border-2 font-medium transition-colors ${
                s === pratica.stato
                  ? `${STATO_COLORE[s]} border-transparent`
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {STATO_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Foto */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium text-gray-700 text-sm">Foto {pratica.foto.length > 0 && `(${pratica.foto.length}/5)`}</p>
          {pratica.foto.length < 5 && (
            <label className={`text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg cursor-pointer ${uploadingFoto ? "opacity-50" : "hover:bg-blue-700"}`}>
              {uploadingFoto ? "Caricamento…" : "📷 Aggiungi"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={caricaFoto}
                disabled={uploadingFoto}
              />
            </label>
          )}
        </div>
        {pratica.foto.length === 0 ? (
          <p className="text-xs text-gray-400">Nessuna foto</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {pratica.foto.map(f => (
              <div key={f.id} className="relative group aspect-square">
                <img
                  src={f.path}
                  alt="Foto pratica"
                  className="w-full h-full object-cover rounded-lg cursor-pointer"
                  onClick={() => setFotoIngrandita(f.path)}
                />
                <button
                  onClick={() => eliminaFoto(f.id)}
                  className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
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
            <p className="font-medium text-gray-800">✏️ Modifica pratica</p>
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Luogo</label>
              <input
                value={formModifica.luogo}
                onChange={e => setFormModifica(f => ({ ...f, luogo: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Tipo pratica</label>
                <select
                  value={formModifica.tipo}
                  onChange={e => {
                    const nuovoTipo = e.target.value as TipoPratica;
                    const statoIniziale = STATO_INIZIALE[nuovoTipo];
                    setFormModifica(f => ({ ...f, tipo: nuovoTipo, stato: statoIniziale }));
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none"
                >
                  {(["SEGNALAZIONE","MIA_IDEA","PROGETTO"] as TipoPratica[]).map(t => (
                    <option key={t} value={t}>{TIPO_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Stato</label>
                <select
                  value={formModifica.stato}
                  onChange={e => setFormModifica(f => ({ ...f, stato: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none"
                >
                  {STATI_PER_TIPO[formModifica.tipo as TipoPratica]?.map(s => (
                    <option key={s} value={s}>{STATO_LABEL[s]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Delega</label>
              <select
                value={formModifica.delega}
                onChange={e => setFormModifica(f => ({ ...f, delega: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none"
              >
                {(Object.keys(DELEGHE_LABEL) as Delega[]).map(d => (
                  <option key={d} value={d}>{DELEGHE_LABEL[d]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Priorità</label>
              <select
                value={formModifica.priorita}
                onChange={e => setFormModifica(f => ({ ...f, priorita: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none"
              >
                <option value="BASSA">Bassa</option>
                <option value="MEDIA">Media</option>
                <option value="ALTA">Alta</option>
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setModificaMode(false)} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Annulla</button>
              <button onClick={salvaModifica} disabled={!formModifica.titolo.trim()} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* Popup promozione idea → progetto */}
      {promozionePopup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-lg space-y-3 shadow-xl">
            <p className="font-medium text-gray-800">🏗️ Crea progetto da questa idea?</p>
            <p className="text-xs text-gray-500">Verrà creata una nuova pratica di tipo Progetto con i dati seguenti.</p>
            <div>
              <label className="text-xs text-gray-500">Titolo progetto</label>
              <input
                value={formProgetto.titolo}
                onChange={e => setFormProgetto(f => ({ ...f, titolo: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Descrizione</label>
              <textarea
                value={formProgetto.descrizione}
                onChange={e => setFormProgetto(f => ({ ...f, descrizione: e.target.value }))}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setPromozionePopup(false)} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Non ora</button>
              <button onClick={creaProgettoDaIdea} disabled={!formProgetto.titolo.trim()} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Crea progetto</button>
            </div>
          </div>
        </div>
      )}

      {/* Popup email */}
      {emailPopup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm space-y-4 shadow-xl">
            <p className="font-medium text-gray-800">📧 Invia via email</p>
            <input
              type="email"
              value={emailDest}
              onChange={e => setEmailDest(e.target.value)}
              placeholder="destinatario@esempio.it"
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setEmailPopup(false)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={inviaEmail}
                disabled={!emailDest.trim()}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Invia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup rispondi */}
      {rispondiPopup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className={`bg-white rounded-xl shadow-xl flex flex-col transition-all duration-200 ${rispondiExpanded ? "w-full h-full max-w-none rounded-none" : "w-full max-w-lg"}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <p className="font-medium text-gray-800 text-sm truncate">✉️ A: {pratica.segnalante?.email}</p>
              <button
                onClick={() => setRispondiExpanded(e => !e)}
                title={rispondiExpanded ? "Riduci" : "Espandi"}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-2 shrink-0"
              >
                {rispondiExpanded ? "⤡" : "⤢"}
              </button>
            </div>

            {/* Corpo */}
            <div className="flex flex-col flex-1 gap-3 px-5 py-3 min-h-0">
              <div className="shrink-0">
                <label className="text-xs text-gray-500">Oggetto</label>
                <input
                  value={formRispondi.oggetto}
                  onChange={e => setFormRispondi(f => ({ ...f, oggetto: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col flex-1 min-h-0">
                <label className="text-xs text-gray-500 shrink-0">Testo</label>
                <textarea
                  value={formRispondi.corpo}
                  onChange={e => setFormRispondi(f => ({ ...f, corpo: e.target.value }))}
                  autoFocus
                  className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y ${rispondiExpanded ? "flex-1 min-h-0 h-full resize-none" : "min-h-[140px]"}`}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-5 pb-5 pt-2 shrink-0">
              <button
                onClick={() => { setRispondiPopup(false); setRispondiExpanded(false); }}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={inviaRisposta}
                disabled={inviandoRisposta || !formRispondi.corpo.trim() || !formRispondi.oggetto.trim()}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {inviandoRisposta ? "Invio…" : "Invia risposta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {fotoIngrandita && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setFotoIngrandita(null)}
        >
          <img src={fotoIngrandita} alt="Foto ingrandita" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}

      {/* Appuntamenti */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium text-gray-700 text-sm">Appuntamenti</p>
          <button onClick={() => setShowAppForm(f => !f)} className="text-xs text-blue-600 hover:underline">
            + Aggiungi
          </button>
        </div>

        {showAppForm && (
          <form onSubmit={aggiungiAppuntamento} className="space-y-2 mb-3 pb-3 border-b border-gray-100">
            <input
              type="text" placeholder="Titolo *" required
              value={formApp.titolo} onChange={e => setFormApp(f => ({ ...f, titolo: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="datetime-local" required
              value={formApp.dataOra} onChange={e => setFormApp(f => ({ ...f, dataOra: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text" placeholder="Luogo"
              value={formApp.luogo} onChange={e => setFormApp(f => ({ ...f, luogo: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={savingApp}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                {savingApp ? "Salvataggio…" : "Salva + Google Calendar"}
              </button>
              <button type="button" onClick={() => setShowAppForm(false)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600">
                Annulla
              </button>
            </div>
          </form>
        )}

        {pratica.appuntamenti.length === 0 ? (
          <p className="text-xs text-gray-400">Nessun appuntamento</p>
        ) : (
          <div className="space-y-2">
            {pratica.appuntamenti.map(a => {
              const d = new Date(a.dataOra);
              return (
                <div key={a.id} className="flex gap-3 items-start">
                  <div className="text-center min-w-[40px]">
                    <p className="text-lg font-bold text-blue-600 leading-none">{d.getDate()}</p>
                    <p className="text-xs text-gray-400">{d.toLocaleDateString("it-IT", { month: "short" })}</p>
                    <p className="text-xs text-gray-400">{d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{a.titolo}</p>
                    {a.luogo && <p className="text-xs text-gray-500">📍 {a.luogo}</p>}
                    {a.googleEventId && <span className="text-xs text-green-600">✓ Google Calendar</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Diario evoluzioni */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="font-medium text-gray-700 mb-3 text-sm">📋 Diario evoluzioni</p>
        {/* Form aggiungi */}
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
        {/* Lista cronologica inversa */}
        <div className="space-y-2">
          {pratica.note.length === 0 && (
            <p className="text-xs text-gray-400">Nessun aggiornamento ancora</p>
          )}
          {[...pratica.note].reverse().map((n, i) => (
            <div key={n.id} className={`rounded-lg px-3 py-2 border-l-2 ${i === 0 ? "bg-blue-50 border-blue-400" : "bg-gray-50 border-gray-200"}`}>
              <p className="text-sm text-gray-800">{n.testo}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(n.createdAt).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Mail inviate */}
      {pratica.mailInviate.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="font-medium text-gray-700 mb-3 text-sm">📨 Mail inviate ({pratica.mailInviate.length})</p>
          <div className="space-y-2">
            {pratica.mailInviate.map(m => (
              <div key={m.id} className="border border-gray-100 rounded-lg overflow-hidden">
                {/* Header riga */}
                <button
                  onClick={() => setMailAperta(mailAperta === m.id ? null : m.id)}
                  className="w-full flex items-start gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{m.oggetto}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      A: {m.to} · {new Date(m.sentAt).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className="text-gray-300 text-xs shrink-0 mt-0.5">{mailAperta === m.id ? "▲" : "▼"}</span>
                </button>
                {/* Corpo espanso */}
                {mailAperta === m.id && (
                  <div className="border-t border-gray-100 bg-gray-50 px-3 py-3">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">{m.corpo}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Storico */}
      {pratica.storico.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="font-medium text-gray-700 mb-3 text-sm">Storico stati</p>
          <div className="space-y-1">
            {pratica.storico.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-xs text-gray-500">
                <span>{new Date(s.createdAt).toLocaleDateString("it-IT")}</span>
                <span>{s.statoPrecedente ? STATO_LABEL[s.statoPrecedente] : "—"}</span>
                <span>→</span>
                <span className="font-medium text-gray-700">{STATO_LABEL[s.statoNuovo]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
