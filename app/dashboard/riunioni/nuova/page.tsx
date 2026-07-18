"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function oggiFormattato(): string {
  return new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

export default function NuovaRiunionePage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">Caricamento…</div>}>
      <NuovaRiunioneContent />
    </Suspense>
  );
}

function NuovaRiunioneContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const personaId = searchParams.get("personaId");
  const progettoId = searchParams.get("progettoId");

  const [contesto, setContesto] = useState<string>("");
  const [titolo, setTitolo] = useState("");
  const [titoloModificato, setTitoloModificato] = useState(false);
  const [supportato, setSupportato] = useState(true);
  const [stato, setStato] = useState<"idle" | "ascolto" | "pausa">("idle");
  const [finale, setFinale] = useState("");
  const [interim, setInterim] = useState("");
  const [generando, setGenerando] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const fermatoManualmente = useRef(true);
  // Testo finale già "committato" da sessioni di riconoscimento precedenti (prima di ogni pausa/riavvio).
  const finaleAccumulatoRef = useRef("");
  // Testo finale della sessione di riconoscimento corrente, ricalcolato da zero ad ogni evento.
  const sessioneFinaleRef = useRef("");
  // Ultimo segmento effettivamente committato: su Android Chrome, in modalità continuous, lo stesso
  // risultato viene talvolta rifirmato identico in sessioni consecutive — questo evita di ripeterlo.
  const ultimoSegmentoCommitatoRef = useRef("");

  useEffect(() => {
    if (personaId) {
      fetch(`/api/persone/${personaId}`).then(r => r.ok ? r.json() : null).then(p => {
        if (p) {
          setContesto(`Riunione con ${p.nome} ${p.cognome}`);
          if (!titoloModificato) setTitolo(`Riunione con ${p.nome} ${p.cognome} - ${oggiFormattato()}`);
        }
      }).catch(() => {});
    } else if (progettoId) {
      fetch(`/api/progetti/${progettoId}`).then(r => r.ok ? r.json() : null).then(p => {
        if (p) {
          setContesto(`Riunione sul progetto "${p.titolo}"`);
          if (!titoloModificato) setTitolo(`Riunione su ${p.titolo} - ${oggiFormattato()}`);
        }
      }).catch(() => {});
    } else {
      if (!titoloModificato) setTitolo(`Riunione libera - ${oggiFormattato()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId, progettoId]);

  useEffect(() => {
    const SpeechRecognition = (window as unknown as Record<string, unknown>).webkitSpeechRecognition
      ?? (window as unknown as Record<string, unknown>).SpeechRecognition;
    if (!SpeechRecognition) { setSupportato(false); return; }

    const RecognitionCtor = SpeechRecognition as new () => SpeechRecognitionLike;
    const recognition = new RecognitionCtor();
    recognition.lang = "it-IT";
    // `continuous: true` è inaffidabile su Chrome Android: il motore vocale tende a rifirmare come
    // "final" lo stesso risultato più volte, producendo la parola ripetuta in loop. Con `continuous:
    // false` ogni sessione cattura una singola frase e si conclude da sola; il riavvio immediato in
    // onend simula il comportamento continuo senza incorrere nel bug.
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (e: unknown) => {
      const event = e as { results: { length: number; [i: number]: { 0: { transcript: string }; isFinal: boolean } } };
      // Ricostruisce il testo finale della sessione corrente da zero, scorrendo TUTTI i risultati
      // (0..length) invece di accumulare solo il delta da resultIndex: evita duplicazioni quando
      // il browser rifirma come "final" un risultato già visto.
      let sessioneFinale = "";
      let sessioneInterim = "";
      for (let i = 0; i < event.results.length; i++) {
        const risultato = event.results[i];
        if (risultato.isFinal) sessioneFinale += (sessioneFinale ? " " : "") + risultato[0].transcript.trim();
        else sessioneInterim += (sessioneInterim ? " " : "") + risultato[0].transcript.trim();
      }
      sessioneFinaleRef.current = sessioneFinale;
      const finaleCorrente = [finaleAccumulatoRef.current, sessioneFinale].filter(Boolean).join(" ");
      setFinale(finaleCorrente);
      setInterim(sessioneInterim);
    };

    recognition.onerror = () => { /* ignorato — onend gestisce il riavvio */ };

    recognition.onend = () => {
      // Ogni sessione (anche i riavvii automatici) riparte con un array `results` vuoto:
      // prima di ripartire, il testo finale prodotto finora va "committato" nell'accumulo totale.
      // Scarta il segmento se identico all'ultimo committato: capita che Chrome Android rifirmi
      // la stessa frase in due sessioni consecutive senza nuovo parlato in mezzo.
      const segmento = sessioneFinaleRef.current.trim();
      if (segmento && segmento.toLowerCase() !== ultimoSegmentoCommitatoRef.current.toLowerCase()) {
        finaleAccumulatoRef.current = [finaleAccumulatoRef.current, segmento].filter(Boolean).join(" ");
        ultimoSegmentoCommitatoRef.current = segmento;
      }
      sessioneFinaleRef.current = "";
      setFinale(finaleAccumulatoRef.current);

      if (!fermatoManualmente.current) {
        try { recognition.start(); } catch { /* già in ascolto */ }
      } else {
        setInterim("");
        setStato("idle");
      }
    };

    recognitionRef.current = recognition;
    return () => { fermatoManualmente.current = true; try { recognition.stop(); } catch { /* noop */ } };
  }, []);

  function avviaAscolto() {
    if (!recognitionRef.current) return;
    fermatoManualmente.current = false;
    setInterim("");
    setStato("ascolto");
    try { recognitionRef.current.start(); } catch { /* già avviato */ }
  }

  function fermaAscolto() {
    if (!recognitionRef.current) return;
    fermatoManualmente.current = true;
    recognitionRef.current.stop();
    setStato("pausa");
  }

  async function generaChecklist() {
    if (!finale.trim()) return;
    setGenerando(true);
    fermaAscolto();

    const res = await fetch("/api/riunioni", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titolo: titolo.trim() || `Riunione - ${oggiFormattato()}`,
        personaId: personaId ? Number(personaId) : undefined,
        progettoId: progettoId ?? undefined,
        trascrizioneGrezza: finale.trim(),
      }),
    });

    if (!res.ok) {
      alert("Errore nella creazione della riunione");
      setGenerando(false);
      return;
    }
    const riunione = await res.json();

    const res2 = await fetch(`/api/riunioni/${riunione.id}/genera-checklist`, { method: "POST" });
    setGenerando(false);
    if (res2.ok) {
      router.push(`/dashboard/riunioni/${riunione.id}/revisione`);
    } else {
      const err = await res2.json().catch(() => ({}));
      alert(`Errore generazione checklist: ${err.error ?? res2.status}. Puoi comunque proseguire dalla schermata di revisione.`);
      router.push(`/dashboard/riunioni/${riunione.id}/revisione`);
    }
  }

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-lg">←</button>
        <h1 className="text-lg font-bold text-gray-900">🎙️ Nuova riunione</h1>
      </div>

      {contesto && <p className="text-sm text-gray-500">{contesto}</p>}

      <div>
        <label className="text-xs text-gray-500">Titolo</label>
        <input
          value={titolo}
          onChange={e => { setTitolo(e.target.value); setTitoloModificato(true); }}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {!supportato ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          Il riconoscimento vocale non è supportato da questo browser. Usa Chrome su Android, oppure scrivi direttamente gli argomenti nella schermata di revisione dopo aver creato una riunione vuota.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center gap-4">
          <button
            onClick={stato === "ascolto" ? fermaAscolto : avviaAscolto}
            className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-colors ${
              stato === "ascolto" ? "bg-red-500 text-white animate-pulse" : "bg-blue-600 text-white"
            }`}
          >
            🎙️
          </button>
          <p className="text-sm text-gray-500">
            {stato === "ascolto" ? "In ascolto… tocca per mettere in pausa" : stato === "pausa" ? "In pausa — tocca per riprendere" : "Tocca per iniziare a parlare"}
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="font-medium text-gray-700 mb-2 text-sm">Trascrizione</p>
        {!finale && !interim ? (
          <p className="text-xs text-gray-400">Il testo comparirà qui mentre parli…</p>
        ) : (
          <p className="text-sm text-gray-800 whitespace-pre-wrap">
            {finale}
            {interim && <span className="text-gray-400 italic"> {interim}</span>}
          </p>
        )}
      </div>

      <button
        onClick={generaChecklist}
        disabled={!finale.trim() || generando}
        className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
      >
        {generando ? "Generazione checklist…" : "✓ Genera checklist"}
      </button>
    </div>
  );
}
