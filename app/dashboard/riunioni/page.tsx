"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ArgomentoRiunione, Riunione, StatoRiunione } from "@prisma/client";

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

type RiunioneCard = Riunione & {
  persona: { nome: string; cognome: string } | null;
  progetto: { titolo: string } | null;
  argomenti: ArgomentoRiunione[];
};

export default function RiunioniPage() {
  const [riunioni, setRiunioni] = useState<RiunioneCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/riunioni")
      .then(r => r.json())
      .then(data => { setRiunioni(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">🎙️ Riunioni</h1>
        <Link
          href="/dashboard/riunioni/nuova"
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
        >
          + Nuova
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Caricamento…</div>
      ) : riunioni.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🎙️</p>
          <p>Nessuna riunione ancora</p>
        </div>
      ) : (
        <div className="space-y-3">
          {riunioni.map(r => {
            const trattati = r.argomenti.filter(a => a.spuntato).length;
            return (
              <Link
                key={r.id}
                href={r.stato === "IN_PREPARAZIONE" ? `/dashboard/riunioni/${r.id}/revisione` : `/dashboard/riunioni/${r.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_COLORE[r.stato]}`}>
                    {STATO_LABEL[r.stato]}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900 leading-snug">{r.titolo}</p>
                <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                  {r.persona && <span>👤 {r.persona.nome} {r.persona.cognome}</span>}
                  {r.progetto && <span>📁 {r.progetto.titolo}</span>}
                  {r.argomenti.length > 0 && <span>{trattati}/{r.argomenti.length} trattati</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
