"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DELEGHE_LABEL } from "@/lib/constants";
import type { Delega } from "@prisma/client";

type Categoria = "segnalazione" | "progetto" | "contestazione";

const CATEGORIA_LABEL: Record<Categoria, string> = {
  segnalazione: "📢 Segnalazione",
  progetto: "📁 Progetto",
  contestazione: "⚠️ Contestazione",
};

const CATEGORIA_COLORE: Record<Categoria, string> = {
  segnalazione: "bg-red-100 text-red-700",
  progetto: "bg-blue-100 text-blue-700",
  contestazione: "bg-yellow-100 text-yellow-800",
};

const GESTORE_LABEL: Record<string, string> = {
  ACAM_AMBIENTE: "ACAM Ambiente",
  ACAM_ACQUE: "ACAM Acque",
  ATC: "ATC",
};

type MailAnteprima = {
  messageId: string;
  categoria: Categoria;
  oggettoOriginale: string;
  mittente: string;
  data: string;
  descrizione: string;
  hasAllegati: boolean;
  nAllegati: number;
  titolo: string;
  delega: string;
  gestore: string;
  luogo: string;
  nomeMittente: string;
  emailMittente: string;
  protocollo: string;
  dataProtocollo: string;
  selezionata: boolean;
};

type Cursor = { fonte: number; pageToken?: string } | null;

export default function ImportMailPage() {
  const router = useRouter();
  const [mails, setMails] = useState<MailAnteprima[]>([]);
  const [loading, setLoading] = useState(true);
  const [caricandoAltre, setCaricandoAltre] = useState(false);
  const [cursor, setCursor] = useState<Cursor>({ fonte: 0 });
  const [importando, setImportando] = useState(false);
  const [espansa, setEspansa] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/import-mail")
      .then(r => r.json())
      .then(data => {
        setMails(data.mails.map((m: Omit<MailAnteprima, "selezionata">) => ({ ...m, selezionata: true })));
        setCursor(data.nextCursor);
        setLoading(false);
      });
  }, []);

  async function caricaAltre() {
    if (!cursor) return;
    setCaricandoAltre(true);
    const params = new URLSearchParams({ fonte: String(cursor.fonte) });
    if (cursor.pageToken) params.set("pageToken", cursor.pageToken);
    const res = await fetch(`/api/import-mail?${params}`);
    const data = await res.json();
    setMails(ms => [...ms, ...data.mails.map((m: Omit<MailAnteprima, "selezionata">) => ({ ...m, selezionata: true }))]);
    setCursor(data.nextCursor);
    setCaricandoAltre(false);
  }

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
          categoria: m.categoria,
          titolo: m.titolo,
          delega: m.delega,
          gestore: m.gestore,
          descrizione: m.descrizione.slice(0, 1000),
          luogo: m.luogo,
          nomeMittente: m.nomeMittente,
          emailMittente: m.emailMittente,
          protocollo: m.protocollo,
          dataProtocollo: m.dataProtocollo,
        })),
      }),
    });
    setImportando(false);
    if (res.ok) {
      const { importate } = await res.json();
      alert(`${importate} elementi creati!`);
      router.push("/dashboard");
    }
  }

  const selezionate = mails.filter(m => m.selezionata).length;
  const tutteSelezionate = mails.length > 0 && selezionate === mails.length;

  function toggleTutte() {
    setMails(ms => ms.map(m => ({ ...m, selezionata: !tutteSelezionate })));
  }

  return (
    <div className="space-y-4 pb-32">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Importa da mail</h1>
          <p className="text-xs text-gray-500">Segnalazioni, Deleghe→Progetto, Contestazioni</p>
        </div>
        <div className="flex gap-2 items-center">
          {mails.length > 0 && (
            <button
              onClick={toggleTutte}
              className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              {tutteSelezionate ? "Deseleziona tutte" : "Seleziona tutte"}
            </button>
          )}
          <button
            onClick={importa}
            disabled={!selezionate || importando}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-blue-700"
          >
            {importando ? "Importo…" : `Importa ${selezionate > 0 ? `(${selezionate})` : ""}`}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Caricamento mail…</div>
      ) : mails.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p>Nessuna mail da importare</p>
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
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CATEGORIA_COLORE[m.categoria]}`}>
                    {CATEGORIA_LABEL[m.categoria]}
                  </span>
                  <p className="text-sm font-medium text-gray-900 truncate">{m.titolo}</p>
                  <p className="text-xs text-gray-500 truncate">{m.nomeMittente}</p>
                  <div className="flex gap-2 flex-wrap">
                    {m.protocollo && <p className="text-xs text-gray-400">Prot. {m.protocollo} del {m.dataProtocollo}</p>}
                    {m.hasAllegati && <p className="text-xs text-blue-500">📎 {m.nAllegati} allegati</p>}
                  </div>
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
                      <label className="text-xs text-gray-500">Titolo / Oggetto</label>
                      <input
                        value={m.titolo}
                        onChange={e => aggiorna(m.messageId, "titolo", e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {m.categoria === "contestazione" ? (
                      <div>
                        <label className="text-xs text-gray-500">Gestore</label>
                        <select
                          value={m.gestore}
                          onChange={e => aggiorna(m.messageId, "gestore", e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none"
                        >
                          {Object.keys(GESTORE_LABEL).map(g => (
                            <option key={g} value={g}>{GESTORE_LABEL[g]}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
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
                    )}

                    {m.categoria === "segnalazione" && (
                      <>
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
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {cursor && (
            <button
              onClick={caricaAltre}
              disabled={caricandoAltre}
              className="w-full text-sm text-blue-600 border border-blue-200 rounded-xl py-2.5 hover:bg-blue-50 disabled:opacity-50"
            >
              {caricandoAltre ? "Carico…" : "Carica altre 10"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
