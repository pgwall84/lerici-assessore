"use client";

import { useEffect, useState } from "react";
import { DELEGHE_LABEL } from "@/lib/constants";
import type { Delega } from "@prisma/client";

type Categoria = "segnalazione" | "progetto" | "contestazione" | "giustifica";
type Binario = "AUTOMATICO" | "MANUALE" | "INCERTO" | "PROPOSTA_CONTINUAZIONE";

const CATEGORIA_LABEL: Record<Categoria, string> = {
  segnalazione: "📢 Segnalazione",
  progetto: "📁 Progetto",
  contestazione: "⚠️ Contestazione",
  giustifica: "📝 Giustifica",
};

const CATEGORIA_COLORE: Record<Categoria, string> = {
  segnalazione: "bg-red-100 text-red-700",
  progetto: "bg-blue-100 text-blue-700",
  contestazione: "bg-yellow-100 text-yellow-800",
  giustifica: "bg-purple-100 text-purple-700",
};

const BINARIO_LABEL: Record<Binario, string> = {
  AUTOMATICO: "⚙️ Automatico — da confermare",
  MANUALE: "✋ Manuale",
  INCERTO: "❓ Incerto",
  PROPOSTA_CONTINUAZIONE: "🔗 Possibile continuazione",
};

const BINARIO_COLORE: Record<Binario, string> = {
  AUTOMATICO: "bg-gray-100 text-gray-600",
  MANUALE: "bg-blue-50 text-blue-700",
  INCERTO: "bg-red-50 text-red-700",
  PROPOSTA_CONTINUAZIONE: "bg-purple-50 text-purple-700",
};

const TIPO_AUTOMATICO_LABEL: Record<string, string> = {
  CONVOCAZIONE_CONSIGLIO: "Convocazione Consiglio",
  CONVOCAZIONE_COMMISSIONE: "Convocazione Commissione",
  CONVOCAZIONE_GIUNTA: "Convocazione Giunta",
  MOZIONE: "Mozione",
  INTERROGAZIONE: "Interrogazione",
  VERBALE_GIUNTA: "Verbale Giunta",
  GIUSTIFICA: "Giustifica",
  CONTINUAZIONE: "Continuazione di una pratica",
};

const TIPO_ENTITA_LABEL: Record<string, string> = {
  pratica: "📢 Segnalazione",
  progetto: "📁 Progetto",
  contestazione: "⚠️ Contestazione",
};

const GESTORE_LABEL: Record<string, string> = {
  ACAM_AMBIENTE: "ACAM Ambiente",
  ACAM_ACQUE: "ACAM Acque",
  ATC: "ATC",
};

type Voce = {
  mailProcessataId: string;
  binario: Binario;
  categoriaProposta: string | null;
  confidenza: number | null;
  messageId: string;
  oggettoOriginale: string;
  mittente: string;
  nomeMittente: string;
  emailMittente: string;
  titolo: string;
  descrizione: string;
  protocollo: string;
  dataProtocollo: string;
  hasAllegati: boolean;
  nAllegati: number;
  delegaSuggerita: string;
  gestoreSuggerito: string;
  entitaProposta: { tipo: string; id: string; titolo: string; ambiguo: boolean } | null;
  // stato locale di modifica
  categoria: Categoria | "";
  delega: string;
  gestore: string;
  luogo: string;
  // stato locale per la scelta ODG (solo Automatico ambiguo)
  candidatiOdg: { indice: number; nomeFile: string }[] | null;
  indiceOdgScelto: number | null;
  // stato locale solo per Possibile continuazione: collegare o creare comunque una voce nuova
  modalitaProposta: "collega" | "nuova";
};

const FILTRI: { value: Binario | ""; label: string }[] = [
  { value: "", label: "Tutte" },
  { value: "INCERTO", label: "❓ Incerto" },
  { value: "MANUALE", label: "✋ Manuale" },
  { value: "PROPOSTA_CONTINUAZIONE", label: "🔗 Continuazione" },
  { value: "AUTOMATICO", label: "⚙️ Automatico" },
];

function toVoce(r: Omit<Voce, "categoria" | "delega" | "gestore" | "luogo" | "candidatiOdg" | "indiceOdgScelto" | "modalitaProposta">): Voce {
  const categoriaIniziale = r.binario === "INCERTO" || r.binario === "PROPOSTA_CONTINUAZIONE"
    ? ""
    : (["segnalazione", "progetto", "contestazione"].includes(r.categoriaProposta ?? "") ? (r.categoriaProposta as Categoria) : "");
  return {
    ...r,
    categoria: categoriaIniziale,
    delega: r.delegaSuggerita,
    gestore: r.gestoreSuggerito,
    luogo: "",
    candidatiOdg: null,
    indiceOdgScelto: null,
    modalitaProposta: "collega",
  };
}

export default function ImportMailPage() {
  const [voci, setVoci] = useState<Voce[]>([]);
  const [loading, setLoading] = useState(true);
  const [caricandoAltre, setCaricandoAltre] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [espansa, setEspansa] = useState<string | null>(null);
  const [confermando, setConfermando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Binario | "">("");
  const [conteggi, setConteggi] = useState({ manuale: 0, incerto: 0, automatico: 0, propostaContinuazione: 0 });

  function caricaConteggi() {
    fetch("/api/motore-mail").then(r => r.ok ? r.json() : null).then(d => { if (d) setConteggi(d); }).catch(() => {});
  }

  function carica(binario: Binario | "") {
    setLoading(true);
    const params = new URLSearchParams();
    if (binario) params.set("binario", binario);
    fetch(`/api/motore-mail/revisione?${params}`)
      .then(r => r.json())
      .then(data => {
        setVoci(data.mails.map(toVoce));
        setCursor(data.nextCursor);
        setLoading(false);
      });
  }

  useEffect(() => { carica(filtro); caricaConteggi(); }, [filtro]);

  async function caricaAltre() {
    if (!cursor) return;
    setCaricandoAltre(true);
    const params = new URLSearchParams({ cursor });
    if (filtro) params.set("binario", filtro);
    const res = await fetch(`/api/motore-mail/revisione?${params}`);
    const data = await res.json();
    setVoci(vs => [...vs, ...data.mails.map(toVoce)]);
    setCursor(data.nextCursor);
    setCaricandoAltre(false);
  }

  function aggiorna(id: string, campo: keyof Voce, valore: string | number | null) {
    setVoci(vs => vs.map(v => v.mailProcessataId === id ? { ...v, [campo]: valore } : v));
  }

  function rimuovi(id: string) {
    setVoci(vs => vs.filter(v => v.mailProcessataId !== id));
    caricaConteggi();
  }

  async function conferma(v: Voce) {
    setConfermando(v.mailProcessataId);

    const body = v.binario === "AUTOMATICO"
      ? (v.indiceOdgScelto !== null ? { indiceOdgForzato: v.indiceOdgScelto } : {})
      : v.binario === "PROPOSTA_CONTINUAZIONE" && v.modalitaProposta === "collega"
      ? { azione: "collega" }
      : {
          azione: "nuova",
          categoria: v.categoria,
          titolo: v.titolo,
          descrizione: v.descrizione.slice(0, 1000),
          delega: v.delega || undefined,
          gestore: v.gestore || undefined,
          luogo: v.luogo || undefined,
          nomeMittente: v.nomeMittente || undefined,
          emailMittente: v.emailMittente || undefined,
          protocollo: v.protocollo || undefined,
          dataProtocollo: v.dataProtocollo || undefined,
        };

    const res = await fetch(`/api/motore-mail/${v.mailProcessataId}/conferma`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setConfermando(null);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Errore: ${JSON.stringify(err.error ?? res.status)}`);
      return;
    }

    const r = await res.json();
    if (r.ambiguo) {
      aggiorna(v.mailProcessataId, "candidatiOdg", r.candidati);
      return;
    }
    rimuovi(v.mailProcessataId);
  }

  return (
    <div className="space-y-4 pb-32">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Revisione mail</h1>
        <p className="text-xs text-gray-500">Motore di scansione — conferma o correggi prima di creare la pratica</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTRI.map(f => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filtro === f.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"
            }`}
          >
            {f.label}
            {f.value === "INCERTO" && conteggi.incerto > 0 && <span className="ml-1 opacity-70">{conteggi.incerto}</span>}
            {f.value === "MANUALE" && conteggi.manuale > 0 && <span className="ml-1 opacity-70">{conteggi.manuale}</span>}
            {f.value === "AUTOMATICO" && conteggi.automatico > 0 && <span className="ml-1 opacity-70">{conteggi.automatico}</span>}
            {f.value === "PROPOSTA_CONTINUAZIONE" && conteggi.propostaContinuazione > 0 && <span className="ml-1 opacity-70">{conteggi.propostaContinuazione}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Caricamento…</div>
      ) : voci.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p>Nessuna mail da revisionare</p>
        </div>
      ) : (
        <div className="space-y-3">
          {voci.map(v => (
            <div key={v.mailProcessataId} className="bg-white rounded-xl border border-gray-200">
              <div className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex gap-1.5 flex-wrap mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${BINARIO_COLORE[v.binario]}`}>
                      {BINARIO_LABEL[v.binario]}
                    </span>
                    {v.binario === "AUTOMATICO" && v.categoriaProposta && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-600">
                        {TIPO_AUTOMATICO_LABEL[v.categoriaProposta] ?? v.categoriaProposta}
                      </span>
                    )}
                    {v.binario !== "AUTOMATICO" && v.categoria && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CATEGORIA_COLORE[v.categoria]}`}>
                        {CATEGORIA_LABEL[v.categoria]}
                      </span>
                    )}
                    {v.binario === "PROPOSTA_CONTINUAZIONE" && v.entitaProposta && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple-100 text-purple-700">
                        {TIPO_ENTITA_LABEL[v.entitaProposta.tipo] ?? v.entitaProposta.tipo}: {v.entitaProposta.titolo.slice(0, 40)}
                      </span>
                    )}
                    {v.entitaProposta?.ambiguo && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-orange-100 text-orange-700">
                        ⚠️ protocollo ambiguo
                      </span>
                    )}
                    {v.confidenza !== null && v.confidenza < 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-400">
                        AI {Math.round(v.confidenza * 100)}%
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{v.titolo}</p>
                  <p className="text-xs text-gray-500 truncate">{v.nomeMittente}</p>
                  <div className="flex gap-2 flex-wrap">
                    {v.protocollo && <p className="text-xs text-gray-400">Prot. {v.protocollo} del {v.dataProtocollo}</p>}
                    {v.hasAllegati && <p className="text-xs text-blue-500">📎 {v.nAllegati} allegati</p>}
                  </div>
                </div>
                <button
                  onClick={() => setEspansa(espansa === v.mailProcessataId ? null : v.mailProcessataId)}
                  className="text-xs text-blue-600 shrink-0"
                >
                  {espansa === v.mailProcessataId ? "▲ Chiudi" : "▼ Dettagli"}
                </button>
              </div>

              {espansa === v.mailProcessataId && (
                <div className="border-t border-gray-100 p-3 space-y-3">
                  <div className="bg-gray-50 rounded-lg p-2 text-xs text-gray-600 max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {v.descrizione || "(corpo vuoto)"}
                  </div>

                  {v.binario === "AUTOMATICO" ? (
                    v.candidatiOdg ? (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-600">
                          Più file possibili: quale è l&apos;ordine del giorno?
                        </p>
                        {v.candidatiOdg.map(c => (
                          <label key={c.indice} className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name={`odg-${v.mailProcessataId}`}
                              checked={v.indiceOdgScelto === c.indice}
                              onChange={() => aggiorna(v.mailProcessataId, "indiceOdgScelto", c.indice)}
                            />
                            {c.nomeFile}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">
                        Vai avanti con la creazione automatica dell&apos;atto/giustifica come previsto.
                      </p>
                    )
                  ) : v.binario === "PROPOSTA_CONTINUAZIONE" && v.modalitaProposta === "collega" ? (
                    <div className="space-y-2">
                      {v.entitaProposta?.ambiguo && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-800">
                          ⚠️ Il protocollo di questa mail corrisponde a <strong>più di un elemento</strong> — questa è solo la prima corrispondenza trovata, non necessariamente quella giusta. Verifica bene prima di collegare.
                        </div>
                      )}
                      <p className="text-xs text-gray-600">
                        Verrà aggiunta una nota (+ eventuali allegati) a{" "}
                        <strong>
                          {v.entitaProposta ? `${TIPO_ENTITA_LABEL[v.entitaProposta.tipo] ?? v.entitaProposta.tipo}: ${v.entitaProposta.titolo}` : "questa entità"}
                        </strong>
                        , senza creare nulla di nuovo.
                      </p>
                      <button
                        onClick={() => aggiorna(v.mailProcessataId, "modalitaProposta", "nuova")}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Non è la stessa cosa? Crea una voce nuova invece
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {v.binario === "PROPOSTA_CONTINUAZIONE" && (
                        <button
                          onClick={() => aggiorna(v.mailProcessataId, "modalitaProposta", "collega")}
                          className="text-xs text-purple-600 hover:underline text-left"
                        >
                          ← Torna a &quot;Collega a {v.entitaProposta?.titolo}&quot;
                        </button>
                      )}
                      {(v.binario === "INCERTO" || v.binario === "PROPOSTA_CONTINUAZIONE") && (
                        <div>
                          <label className="text-xs text-gray-500">Categoria</label>
                          <select
                            value={v.categoria}
                            onChange={e => aggiorna(v.mailProcessataId, "categoria", e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none"
                          >
                            <option value="">Seleziona…</option>
                            {(Object.keys(CATEGORIA_LABEL) as Categoria[]).map(c => (
                              <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>
                            ))}
                          </select>
                          <p className="text-[11px] text-gray-400 mt-1">
                            Se è una convocazione Consiglio/Giunta o una giustifica, meglio applicare l&apos;etichetta giusta su Gmail: verrà classificata da sola al prossimo giro.
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="text-xs text-gray-500">Titolo / Oggetto</label>
                        <input
                          value={v.titolo}
                          onChange={e => aggiorna(v.mailProcessataId, "titolo", e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {v.categoria === "contestazione" ? (
                        <div>
                          <label className="text-xs text-gray-500">Gestore</label>
                          <select
                            value={v.gestore}
                            onChange={e => aggiorna(v.mailProcessataId, "gestore", e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none"
                          >
                            {Object.keys(GESTORE_LABEL).map(g => (
                              <option key={g} value={g}>{GESTORE_LABEL[g]}</option>
                            ))}
                          </select>
                        </div>
                      ) : (v.categoria === "segnalazione" || v.categoria === "progetto") && (
                        <div>
                          <label className="text-xs text-gray-500">Delega</label>
                          <select
                            value={v.delega}
                            onChange={e => aggiorna(v.mailProcessataId, "delega", e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none"
                          >
                            {(Object.keys(DELEGHE_LABEL) as Delega[]).map(d => (
                              <option key={d} value={d}>{DELEGHE_LABEL[d]}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {v.categoria === "segnalazione" && (
                        <>
                          <div>
                            <label className="text-xs text-gray-500">Luogo</label>
                            <input
                              value={v.luogo}
                              onChange={e => aggiorna(v.mailProcessataId, "luogo", e.target.value)}
                              placeholder="Es. Via Roma, Lerici"
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-gray-500">Nome segnalante</label>
                              <input
                                value={v.nomeMittente}
                                onChange={e => aggiorna(v.mailProcessataId, "nomeMittente", e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Email segnalante</label>
                              <input
                                value={v.emailMittente}
                                onChange={e => aggiorna(v.mailProcessataId, "emailMittente", e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => conferma(v)}
                    disabled={
                      confermando === v.mailProcessataId ||
                      (v.candidatiOdg !== null && v.indiceOdgScelto === null) ||
                      ((v.binario === "INCERTO" || (v.binario === "PROPOSTA_CONTINUAZIONE" && v.modalitaProposta === "nuova")) && !v.categoria)
                    }
                    className={`w-full text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 ${
                      v.binario === "PROPOSTA_CONTINUAZIONE" && v.modalitaProposta === "collega" ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    {confermando === v.mailProcessataId
                      ? "Conferma…"
                      : v.candidatiOdg
                      ? "✓ Conferma con questo file"
                      : v.binario === "PROPOSTA_CONTINUAZIONE" && v.modalitaProposta === "collega"
                      ? "🔗 Collega"
                      : "✓ Conferma"}
                  </button>
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
