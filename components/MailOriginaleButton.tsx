"use client";

import { useState } from "react";

// Pulsante "Mostra testo completo mail originale" (redesign 2026-07-25) — a richiesta, non
// caricato all'apertura della pagina: risolve il problema per ogni entità esistente (vecchia o
// nuova) senza bisogno di un backfill sul testo già salvato (spesso troncato a 1500 caratteri
// dalla vecchia logica di preview) — il testo pieno si richiede dal vivo solo quando serve
// davvero. Nessuna scrittura: il dato salvato sull'entità resta invariato.
type MittenteReale = { nome: string | null; email: string | null };

export function MailOriginaleButton({ messageId }: { messageId: string | null }) {
  const [aperto, setAperto] = useState(false);
  const [caricando, setCaricando] = useState(false);
  const [testo, setTesto] = useState<string | null>(null);
  const [mittenteReale, setMittenteReale] = useState<MittenteReale | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  if (!messageId) return null;

  async function apri() {
    if (aperto) {
      setAperto(false);
      return;
    }
    setAperto(true);
    if (testo !== null || errore) return; // già caricato in precedenza, non richiamare di nuovo
    setCaricando(true);
    const res = await fetch(`/api/mail-originale/${messageId}`);
    setCaricando(false);
    if (!res.ok) {
      setErrore("Mail non trovata su Gmail (potrebbe essere stata spostata o cancellata).");
      return;
    }
    const data = await res.json();
    setTesto(data.corpoCompleto || "(corpo vuoto)");
    setMittenteReale(data.mittenteReale ?? null);
  }

  return (
    <div>
      <button onClick={apri} className="text-xs text-blue-600 hover:underline">
        {aperto ? "▲ Nascondi" : "📧 Mostra"} testo completo mail originale
      </button>
      {aperto && (
        <div className="mt-2 space-y-2">
          {/* Solo informativo (evolutiva 2026-07-26): rilevato un inoltro con un mittente
              originale diverso da quello tecnico — nessun automatismo, solo un suggerimento in
              chiaro. Vedi lib/inoltro.ts per il caso reale che l'ha motivato (Pratica #41). */}
          {mittenteReale && (mittenteReale.nome || mittenteReale.email) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              📤 Rilevato inoltro — mittente originale probabile:{" "}
              <strong>{mittenteReale.nome ?? mittenteReale.email}</strong>
              {mittenteReale.nome && mittenteReale.email && <> ({mittenteReale.email})</>}
            </div>
          )}
          <div className="bg-gray-50 rounded-lg p-2 text-xs text-gray-600 max-h-64 overflow-y-auto whitespace-pre-wrap border border-gray-200">
            {caricando ? "Caricamento…" : errore ?? testo}
          </div>
        </div>
      )}
    </div>
  );
}
