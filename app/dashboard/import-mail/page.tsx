"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DELEGHE_LABEL } from "@/lib/constants";
import type { Delega } from "@prisma/client";

type MailAnteprima = {
  messageId: string;
  oggettoOriginale: string;
  mittente: string;
  data: string;
  descrizione: string;
  hasFoto: boolean;
  nFoto: number;
  titolo: string;
  delega: string;
  luogo: string;
  nomeMittente: string;
  emailMittente: string;
  selezionata: boolean;
};

export default function ImportMailPage() {
  const router = useRouter();
  const [mails, setMails] = useState<MailAnteprima[]>([]);
  const [loading, setLoading] = useState(true);
  const [importando, setImportando] = useState(false);
  const [espansa, setEspansa] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/import-mail")
      .then(r => r.json())
      .then(data => {
        setMails(data.map((m: Omit<MailAnteprima, "selezionata">) => ({ ...m, selezionata: true })));
        setLoading(false);
      });
  }, []);

  function aggiorna(messageId: string, campo: string, valore: string | boolean) {
    setMails(ms => ms.map(m => m.messageId === messageId ? { ...m, [campo]: valore } : m));
  }

  async function importa() {
    const selezionate = mails.filter(m => m.selezionata);
    if (!selezionate.length) return;
    setImportando(true);
    const res = await fetch("/api/import-mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        importazioni: selezionate.map(m => ({
          messageId: m.messageId,
          titolo: m.titolo,
          delega: m.delega,
          descrizione: m.corpo.slice(0, 1000),
          luogo: m.luogo,
          nomeMittente: m.nomeMittente,
          emailMittente: m.emailMittente,
        })),
      }),
    });
    setImportando(false);
    if (res.ok) {
      const { importate } = await res.json();
      alert(`${importate} segnalazioni create!`);
      router.push("/dashboard");
    }
  }

  const selezionate = mails.filter(m => m.selezionata).length;

  return (
    <div className="space-y-4 pb-32">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Importa da mail</h1>
          <p className="text-xs text-gray-500">Etichetta Gmail: Segnalazioni</p>
        </div>
        <button
          onClick={importa}
          disabled={!selezionate || importando}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-blue-700"
        >
          {importando ? "Importo…" : `Importa ${selezionate > 0 ? `(${selezionate})` : ""}`}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Caricamento mail…</div>
      ) : mails.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p>Nessuna mail da importare</p>
          <p className="text-xs mt-1">Controlla che esista l&apos;etichetta &quot;Segnalazioni&quot; in Gmail</p>
        </div>
      ) : (
        <div className="space-y-3">
          {mails.map(m => (
            <div key={m.messageId} className={`bg-white rounded-xl border transition-colors ${m.selezionata ? "border-blue-300" : "border-gray-200 opacity-60"}`}>
              {/* Header riga */}
              <div className="flex items-center gap-3 p-3">
                <input
                  type="checkbox"
                  checked={m.selezionata}
                  onChange={e => aggiorna(m.messageId, "selezionata", e.target.checked)}
                  className="w-4 h-4 accent-blue-600 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.titolo}</p>
                  <p className="text-xs text-gray-500 truncate">{m.nomeMittente} — {m.oggettoOriginale}</p>
                  {m.hasFoto && <p className="text-xs text-blue-500">📎 {m.nFoto} foto allegate</p>}
                </div>
                <button
                  onClick={() => setEspansa(espansa === m.messageId ? null : m.messageId)}
                  className="text-xs text-blue-600 shrink-0"
                >
                  {espansa === m.messageId ? "▲ Chiudi" : "▼ Modifica"}
                </button>
              </div>

              {/* Campi modificabili */}
              {espansa === m.messageId && (
                <div className="border-t border-gray-100 p-3 space-y-3">
                  {/* Anteprima corpo */}
                  <div className="bg-gray-50 rounded-lg p-2 text-xs text-gray-600 max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {m.descrizione || "(corpo vuoto)"}
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-xs text-gray-500">Titolo segnalazione</label>
                      <input
                        value={m.titolo}
                        onChange={e => aggiorna(m.messageId, "titolo", e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Delega</label>
                      <select
                        value={m.delega}
                        onChange={e => aggiorna(m.messageId, "delega", e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none"
                      >
                        {(Object.keys(DELEGHE_LABEL) as Delega[]).map(d => (
                          <option key={d} value={d}>{DELEGHE_LABEL[d]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Luogo</label>
                      <input
                        value={m.luogo}
                        onChange={e => aggiorna(m.messageId, "luogo", e.target.value)}
                        placeholder="Es. Via Roma, Lerici"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Nome segnalante</label>
                        <input
                          value={m.nomeMittente}
                          onChange={e => aggiorna(m.messageId, "nomeMittente", e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Email segnalante</label>
                        <input
                          value={m.emailMittente}
                          onChange={e => aggiorna(m.messageId, "emailMittente", e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
