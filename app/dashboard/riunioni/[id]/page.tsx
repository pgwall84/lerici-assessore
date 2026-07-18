"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ArgomentoRiunione, Riunione, StatoRiunione } from "@prisma/client";

type RiunioneFull = Riunione & {
  persona: { id: number; nome: string; cognome: string } | null;
  progetto: { id: string; titolo: string } | null;
  argomenti: ArgomentoRiunione[];
};

const STATO_LABEL: Record<StatoRiunione, string> = {
  IN_PREPARAZIONE: "In preparazione",
  PRONTA: "Pronta",
  IN_CORSO: "In corso",
  CONCLUSA: "Conclusa",
};

const STATO_COLORE: Record<StatoRiunione, string> = {
  IN_PREPARAZIONE: "bg-gray-100 text-gray-600",
  PRONTA: "bg-blue-100 text-blue-700",
  IN_CORSO: "bg-yellow-100 text-yellow-800",
  CONCLUSA: "bg-green-100 text-green-800",
};

export default function RiunionePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [riunione, setRiunione] = useState<RiunioneFull | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/riunioni/${id}`)
      .then(r => r.json())
      .then(async (data: RiunioneFull) => {
        if (data.stato === "IN_PREPARAZIONE") {
          router.replace(`/dashboard/riunioni/${id}/revisione`);
          return;
        }
        if (data.stato === "PRONTA") {
          const res = await fetch(`/api/riunioni/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stato: "IN_CORSO" }),
          });
          if (res.ok) data = await res.json();
        }
        setRiunione(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, router]);

  async function toggleArgomento(argId: string, spuntatoAttuale: boolean) {
    setRiunione(r => r ? {
      ...r,
      argomenti: r.argomenti.map(a => a.id === argId ? { ...a, spuntato: !spuntatoAttuale, spuntatoAt: !spuntatoAttuale ? new Date() : null } : a),
    } : r);
    await fetch(`/api/riunioni/${id}/argomenti/${argId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spuntato: !spuntatoAttuale }),
    });
  }

  async function concludiRiunione() {
    if (!confirm("Concludere la riunione?")) return;
    const res = await fetch(`/api/riunioni/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato: "CONCLUSA" }),
    });
    if (res.ok) {
      const aggiornata = await res.json();
      setRiunione(r => r ? { ...r, stato: aggiornata.stato } : r);
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Caricamento…</div>;
  if (!riunione) return <div className="text-center py-12 text-gray-400">Riunione non trovata</div>;

  const conclusa = riunione.stato === "CONCLUSA";
  const trattati = riunione.argomenti.filter(a => a.spuntato).length;

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-lg">←</button>
        <h1 className="text-lg font-bold text-gray-900 flex-1 min-w-0 truncate">{riunione.titolo}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATO_COLORE[riunione.stato]}`}>
          {STATO_LABEL[riunione.stato]}
        </span>
        <span className="text-xs text-gray-500">{trattati}/{riunione.argomenti.length} trattati</span>
      </div>

      {riunione.persona && (
        <Link href="/dashboard/rubrica" className="text-xs text-blue-600 hover:underline">
          👤 {riunione.persona.nome} {riunione.persona.cognome}
        </Link>
      )}
      {riunione.progetto && (
        <Link href={`/dashboard/progetti/${riunione.progetto.id}`} className="text-xs text-blue-600 hover:underline block">
          📁 {riunione.progetto.titolo}
        </Link>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-2">
        {riunione.argomenti.map(a => (
          <button
            key={a.id}
            onClick={() => !conclusa && toggleArgomento(a.id, a.spuntato)}
            disabled={conclusa}
            className="w-full flex items-start gap-3 px-3 py-3 text-left border-b border-gray-50 last:border-0 disabled:cursor-default"
          >
            <span className={`shrink-0 mt-0.5 w-6 h-6 rounded-md border-2 flex items-center justify-center text-sm ${
              a.spuntato ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300"
            }`}>
              {a.spuntato ? "✓" : ""}
            </span>
            <span className={`text-sm flex-1 ${a.spuntato ? "line-through text-gray-400" : "text-gray-800"}`}>
              {a.testo}
            </span>
          </button>
        ))}
      </div>

      {!conclusa && (
        <button
          onClick={concludiRiunione}
          className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-700"
        >
          ✓ Concludi riunione
        </button>
      )}
    </div>
  );
}
