"use client";

import { useState } from "react";

type Persona = { id: number; nome: string; cognome: string; ruolo: string | null; telefono: string | null; email: string | null };
type PersonaLista = { id: number; nome: string; cognome: string; ruolo: string | null };

// Riquadro Referente condiviso (evolutiva 2026-07-26) — prima duplicato identico tra Pratica e
// Progetto, ora un solo posto da mantenere. Possiede il proprio stato UI (modalità assegna, popup
// email, spinner di invio); le specifiche di ogni entità (endpoint, gestione errori, messaggio
// WhatsApp) restano al chiamante tramite le callback, che sa già come parlare con la propria API.
export function ReferenteBox({
  titolo = "Referente",
  responsabile,
  persone,
  onAssegna,
  onInviaTelegram,
  onInviaEmail,
  onWhatsApp,
}: {
  titolo?: string;
  responsabile: Persona | null;
  persone: PersonaLista[];
  onAssegna: (personaId: number) => Promise<void>;
  onInviaTelegram: () => Promise<void>;
  onInviaEmail: (destinatario: string) => Promise<void>;
  onWhatsApp: () => void;
}) {
  const [assegnaMode, setAssegnaMode] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [inviando, setInviando] = useState<string | null>(null);
  const [emailPopup, setEmailPopup] = useState(false);
  const [emailDest, setEmailDest] = useState("");

  async function assegna() {
    if (!selectedPersonaId) return;
    await onAssegna(Number(selectedPersonaId));
    setAssegnaMode(false);
    setSelectedPersonaId("");
  }

  function apriEmailPopup() {
    setEmailDest(responsabile?.email ?? "");
    setEmailPopup(true);
  }

  async function inviaEmail() {
    if (!emailDest.trim()) return;
    setInviando("email");
    setEmailPopup(false);
    await onInviaEmail(emailDest.trim());
    setInviando(null);
  }

  async function inviaTelegram() {
    setInviando("telegram");
    await onInviaTelegram();
    setInviando(null);
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-gray-700">📋 {titolo}</p>
          <button onClick={() => setAssegnaMode(m => !m)} className="text-xs text-blue-600 hover:underline">
            {responsabile ? "Cambia" : "+ Assegna"}
          </button>
        </div>

        {responsabile ? (
          <div>
            <p className="font-medium">{responsabile.nome} {responsabile.cognome}</p>
            {responsabile.ruolo && <p className="text-gray-500">{responsabile.ruolo}</p>}
            {responsabile.telefono && <p className="text-gray-500">{responsabile.telefono}</p>}
            {responsabile.email && <p className="text-gray-500">{responsabile.email}</p>}
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
              onClick={assegna}
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
            onClick={inviaTelegram}
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
            onClick={onWhatsApp}
            className="flex-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg py-2 hover:bg-green-100 transition-colors"
          >
            💬 WhatsApp
          </button>
        </div>
      </div>

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
    </>
  );
}
