"use client";

import { useEffect, useState } from "react";
import {
  DELEGHE_LABEL, ALBERO_ETICHETTE_MAIL, STATO_LABEL, STATI_PER_TIPO,
  STATO_PROGETTO_LABEL, STATO_ATTO_LABEL, ESITO_CONTESTAZIONE_LABEL, TIPO_PROGETTO_LABEL,
} from "@/lib/constants";
import type { Delega, StatoProgetto, StatoAtto, EsitoContestazione, TipoProgetto } from "@prisma/client";

type Binario = "AUTOMATICO" | "MANUALE" | "INCERTO" | "PROPOSTA_CONTINUAZIONE";

// Le uniche 3 categorie create con lo schema "manuale" (titolo/descrizione/allegati liberi) —
// ogni altra voce dell'albero (atti, giustifica, delibere/determine) passa dal gestore Automatico
// corrispondente, con o senza override esplicito (vedi eCategoriaAutomatico più sotto).
const CATEGORIE_MANUALI = ["segnalazione", "progetto", "contestazione"] as const;
type CategoriaManuale = typeof CATEGORIE_MANUALI[number];

function eCategoriaManuale(categoria: string): categoria is CategoriaManuale {
  return (CATEGORIE_MANUALI as readonly string[]).includes(categoria);
}
function eCategoriaAutomatico(categoria: string): boolean {
  return categoria !== "" && !eCategoriaManuale(categoria);
}

function categoriaDiEtichetta(etichetta: string): string {
  return ALBERO_ETICHETTE_MAIL.find(n => n.etichetta === etichetta)?.categoria ?? "";
}

function gruppoDiEtichetta(etichetta: string): string {
  if (etichetta.startsWith("Consiglio Comunale")) return "Consiglio Comunale";
  if (etichetta.startsWith("Giunta")) return "Giunta";
  if (etichetta.startsWith("Deleghe")) return "Deleghe";
  return "Altro";
}
function etichettaBreve(etichetta: string): string {
  const parti = etichetta.split("/");
  return parti.length > 1 ? parti[1] : parti[0];
}
const GRUPPI_ORDINE = ["Consiglio Comunale", "Giunta", "Deleghe", "Altro"];

// Enum di stato pertinente per la categoria risolta — null per le categorie senza un campo
// stato (Giustifica, Verbale Giunta [sempre Archiviato], Delibera/Determina [nessuna entità]).
function opzioniStato(categoria: string): { value: string; label: string }[] | null {
  if (categoria === "segnalazione") return STATI_PER_TIPO.SEGNALAZIONE.map(s => ({ value: s, label: STATO_LABEL[s] }));
  if (categoria === "progetto") return (Object.keys(STATO_PROGETTO_LABEL) as StatoProgetto[]).map(s => ({ value: s, label: STATO_PROGETTO_LABEL[s] }));
  if (categoria === "contestazione") return (Object.keys(ESITO_CONTESTAZIONE_LABEL) as EsitoContestazione[]).map(s => ({ value: s, label: ESITO_CONTESTAZIONE_LABEL[s] }));
  if (["CONVOCAZIONE_CONSIGLIO", "CONVOCAZIONE_COMMISSIONE", "CONVOCAZIONE_GIUNTA", "MOZIONE", "INTERROGAZIONE"].includes(categoria)) {
    return (Object.keys(STATO_ATTO_LABEL) as StatoAtto[]).map(s => ({ value: s, label: STATO_ATTO_LABEL[s] }));
  }
  return null;
}

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
  etichettaProposta: string | null;
  confidenza: number | null;
  messageId: string;
  oggettoOriginale: string;
  mittente: string;
  nomeMittente: string;
  emailMittente: string;
  titolo: string;
  descrizione: string;
  corpoCompleto: string;
  protocollo: string;
  dataProtocollo: string;
  hasAllegati: boolean;
  nAllegati: number;
  delegaSuggerita: string;
  gestoreSuggerito: string;
  entitaProposta: { tipo: string; id: string; titolo: string; ambiguo: boolean } | null;
  // stato locale: etichetta attualmente scelta nel picker (path completo, es. "Deleghe/Viabilità")
  etichettaScelta: string;
  delega: string;
  gestore: string;
  luogo: string;
  // stato iniziale scelto per il tipo risultante (StatoPratica/StatoProgetto/StatoAtto/EsitoContestazione)
  stato: string;
  // solo per categoria "progetto": ipotesi Progetto/Attività, sempre sovrascrivibile
  tipoProgetto: "PROGETTO" | "ATTIVITA" | "";
  tipoProgettoSuggerito: "PROGETTO" | "ATTIVITA" | null;
  caricandoTipoProgetto: boolean;
  // stato locale per la scelta ODG (solo Automatico ambiguo)
  candidatiOdg: { indice: number; nomeFile: string }[] | null;
  indiceOdgScelto: number | null;
  // stato locale solo per Possibile continuazione: collegare o creare comunque una voce nuova
  modalitaProposta: "collega" | "nuova";
  // stato locale solo per Manuale/Incerto: creare una voce nuova o cercare/collegare un'entità
  // già esistente (collegamento manuale, oltre la catena automatica — vedi diagnosi 2026-07-24)
  modalitaManuale: "nuova" | "collega_esistente";
  tipoCollegamento: "pratica" | "progetto" | "contestazione" | "";
  ricercaTesto: string;
  risultatiRicerca: { id: string; titolo: string; stato: string }[];
  cercandoEntita: boolean;
  entitaSelezionata: { tipo: "pratica" | "progetto" | "contestazione"; id: string; titolo: string } | null;
};

const FILTRI: { value: Binario | ""; label: string }[] = [
  { value: "", label: "Tutte" },
  { value: "INCERTO", label: "❓ Incerto" },
  { value: "MANUALE", label: "✋ Manuale" },
  { value: "PROPOSTA_CONTINUAZIONE", label: "🔗 Continuazione" },
  { value: "AUTOMATICO", label: "⚙️ Automatico" },
];

type CampiServer = Omit<Voce,
  "etichettaScelta" | "delega" | "gestore" | "luogo" | "stato" | "tipoProgetto" | "tipoProgettoSuggerito" |
  "caricandoTipoProgetto" | "candidatiOdg" | "indiceOdgScelto" | "modalitaProposta" | "modalitaManuale" |
  "tipoCollegamento" | "ricercaTesto" | "risultatiRicerca" | "cercandoEntita" | "entitaSelezionata"
>;

function toVoce(r: CampiServer): Voce {
  const etichettaIniziale = r.etichettaProposta && ALBERO_ETICHETTE_MAIL.some(n => n.etichetta === r.etichettaProposta)
    ? r.etichettaProposta
    : "";
  const categoriaIniziale = categoriaDiEtichetta(etichettaIniziale);
  return {
    ...r,
    etichettaScelta: etichettaIniziale,
    delega: r.delegaSuggerita,
    gestore: r.gestoreSuggerito,
    luogo: "",
    stato: opzioniStato(categoriaIniziale)?.[0]?.value ?? "",
    tipoProgetto: "",
    tipoProgettoSuggerito: null,
    caricandoTipoProgetto: false,
    candidatiOdg: null,
    indiceOdgScelto: null,
    modalitaProposta: "collega",
    modalitaManuale: "nuova",
    tipoCollegamento: "",
    ricercaTesto: "",
    risultatiRicerca: [],
    cercandoEntita: false,
    entitaSelezionata: null,
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

  function aggiorna<K extends keyof Voce>(id: string, campo: K, valore: Voce[K]) {
    setVoci(vs => vs.map(v => v.mailProcessataId === id ? { ...v, [campo]: valore } : v));
  }

  async function caricaTipoProgettoSuggerito(v: Voce) {
    aggiorna(v.mailProcessataId, "caricandoTipoProgetto", true);
    const res = await fetch(`/api/motore-mail/${v.mailProcessataId}/tipo-progetto-suggerito`);
    const data = await res.json().catch(() => ({ tipo: null }));
    aggiorna(v.mailProcessataId, "tipoProgettoSuggerito", data.tipo ?? null);
    aggiorna(v.mailProcessataId, "tipoProgetto", (data.tipo as "PROGETTO" | "ATTIVITA" | null) ?? "PROGETTO");
    aggiorna(v.mailProcessataId, "caricandoTipoProgetto", false);
  }

  // Aperta la prima volta che una riga "progetto" viene mostrata (badge o Dettagli) — mai per
  // righe mai aperte, per non spendere una chiamata AI su ogni riga della pagina.
  function apriDettagli(v: Voce) {
    const apri = espansa !== v.mailProcessataId;
    setEspansa(apri ? v.mailProcessataId : null);
    if (apri && categoriaDiEtichetta(v.etichettaScelta) === "progetto" && v.tipoProgettoSuggerito === null && !v.caricandoTipoProgetto) {
      caricaTipoProgettoSuggerito(v);
    }
  }

  function sceltaEtichetta(v: Voce, etichetta: string) {
    const nodo = ALBERO_ETICHETTE_MAIL.find(n => n.etichetta === etichetta);
    const categoria = nodo?.categoria ?? "";
    aggiorna(v.mailProcessataId, "etichettaScelta", etichetta);
    // La delega di un ramo Deleghe/* diverso non deve restare "appiccicata" a un'altra categoria
    // (es. Segnalazioni) — meglio vuota e da scegliere che una delega di un altro ramo lasciata lì.
    aggiorna(v.mailProcessataId, "delega", nodo?.delega ?? "");
    aggiorna(v.mailProcessataId, "stato", opzioniStato(categoria)?.[0]?.value ?? "");
    if (categoria === "progetto") {
      if (v.tipoProgettoSuggerito === null && !v.caricandoTipoProgetto) {
        caricaTipoProgettoSuggerito(v);
      } else {
        aggiorna(v.mailProcessataId, "tipoProgetto", v.tipoProgettoSuggerito ?? "PROGETTO");
      }
    }
  }

  async function cercaEntita(v: Voce) {
    if (!v.tipoCollegamento || v.ricercaTesto.trim().length < 2) return;
    aggiorna(v.mailProcessataId, "cercandoEntita", true);
    const params = new URLSearchParams({ tipo: v.tipoCollegamento, q: v.ricercaTesto.trim() });
    const res = await fetch(`/api/motore-mail/cerca-entita?${params}`);
    const data = await res.json().catch(() => ({ risultati: [] }));
    aggiorna(v.mailProcessataId, "risultatiRicerca", data.risultati ?? []);
    aggiorna(v.mailProcessataId, "cercandoEntita", false);
  }

  function rimuovi(id: string) {
    setVoci(vs => vs.filter(v => v.mailProcessataId !== id));
    caricaConteggi();
  }

  async function elimina(v: Voce) {
    if (!confirm(`Spostare nel Cestino Gmail "${v.titolo}"?`)) return;
    setConfermando(v.mailProcessataId);
    const res = await fetch(`/api/motore-mail/${v.mailProcessataId}`, { method: "DELETE" });
    setConfermando(null);
    if (res.ok) { rimuovi(v.mailProcessataId); return; }
    const err = await res.json().catch(() => ({}));
    alert(`Errore: ${JSON.stringify(err.error ?? res.status)}`);
  }

  async function nonRilevante(v: Voce) {
    if (!confirm(`Segnare "${v.titolo}" come non rilevante?`)) return;
    setConfermando(v.mailProcessataId);
    const res = await fetch(`/api/motore-mail/${v.mailProcessataId}/non-rilevante`, { method: "POST" });
    setConfermando(null);
    if (res.ok) { rimuovi(v.mailProcessataId); return; }
    const err = await res.json().catch(() => ({}));
    alert(`Errore: ${JSON.stringify(err.error ?? res.status)}`);
  }

  async function conferma(v: Voce) {
    setConfermando(v.mailProcessataId);

    const categoriaRisolta = categoriaDiEtichetta(v.etichettaScelta) || v.categoriaProposta || "";
    const nativoAutomatico = v.binario === "AUTOMATICO" && categoriaRisolta === v.categoriaProposta;
    const statoIniziale = v.stato || undefined;

    let body: Record<string, unknown>;
    if (v.binario === "PROPOSTA_CONTINUAZIONE" && v.modalitaProposta === "collega") {
      body = { azione: "collega" };
    } else if ((v.binario === "MANUALE" || v.binario === "INCERTO") && v.modalitaManuale === "collega_esistente" && v.entitaSelezionata) {
      body = { azione: "collega_esistente", tipo: v.entitaSelezionata.tipo, entitaId: v.entitaSelezionata.id };
    } else if (eCategoriaAutomatico(categoriaRisolta)) {
      const base = { indiceOdgForzato: v.indiceOdgScelto !== null ? v.indiceOdgScelto : undefined, statoIniziale };
      body = nativoAutomatico ? base : { azione: "esegui_automatico", categoria: categoriaRisolta, ...base };
    } else {
      body = {
        azione: "nuova",
        categoria: categoriaRisolta,
        titolo: v.titolo,
        descrizione: v.descrizione.slice(0, 1000),
        delega: v.delega || undefined,
        gestore: v.gestore || undefined,
        luogo: v.luogo || undefined,
        nomeMittente: v.nomeMittente || undefined,
        emailMittente: v.emailMittente || undefined,
        protocollo: v.protocollo || undefined,
        dataProtocollo: v.dataProtocollo || undefined,
        stato: statoIniziale,
        tipoProgetto: categoriaRisolta === "progetto" ? (v.tipoProgetto || undefined) : undefined,
      };
    }

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
          {voci.map(v => {
            const categoriaRisolta = categoriaDiEtichetta(v.etichettaScelta) || v.categoriaProposta || "";
            const opzioni = opzioniStato(categoriaRisolta);
            return (
            <div key={v.mailProcessataId} className="bg-white rounded-xl border border-gray-200">
              <div className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex gap-1.5 flex-wrap mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${BINARIO_COLORE[v.binario]}`}>
                      {BINARIO_LABEL[v.binario]}
                    </span>
                    <button
                      onClick={() => apriDettagli(v)}
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                    >
                      🏷️ {v.etichettaScelta || v.etichettaProposta || "Nessuna proposta — scegli"}
                    </button>
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
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex gap-2">
                    <button
                      onClick={() => nonRilevante(v)}
                      disabled={confermando === v.mailProcessataId}
                      className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                    >
                      🚫 Non rilevante
                    </button>
                    <button
                      onClick={() => elimina(v)}
                      disabled={confermando === v.mailProcessataId}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      🗑️ Elimina
                    </button>
                  </div>
                  <button onClick={() => apriDettagli(v)} className="text-xs text-blue-600">
                    {espansa === v.mailProcessataId ? "▲ Chiudi" : "▼ Dettagli"}
                  </button>
                </div>
              </div>

              {espansa === v.mailProcessataId && (
                <div className="border-t border-gray-100 p-3 space-y-3">
                  <div className="bg-gray-50 rounded-lg p-2 text-xs text-gray-600 max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {v.corpoCompleto || "(corpo vuoto)"}
                  </div>

                  {v.candidatiOdg ? (
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
                  ) : (v.binario === "MANUALE" || v.binario === "INCERTO") && v.modalitaManuale === "collega_esistente" ? (
                    <div className="space-y-2 bg-purple-50 border border-purple-100 rounded-lg p-2">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => aggiorna(v.mailProcessataId, "modalitaManuale", "nuova")}
                          className="text-[11px] px-2 py-1 rounded-full border bg-white text-gray-600 border-gray-300"
                        >
                          ✏️ Crea nuova
                        </button>
                      </div>
                      <div className="flex gap-1.5">
                        {(["pratica", "progetto", "contestazione"] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => {
                              aggiorna(v.mailProcessataId, "tipoCollegamento", t);
                              aggiorna(v.mailProcessataId, "risultatiRicerca", []);
                              aggiorna(v.mailProcessataId, "entitaSelezionata", null);
                            }}
                            className={`text-[11px] px-2 py-1 rounded-full border ${
                              v.tipoCollegamento === t ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-300"
                            }`}
                          >
                            {TIPO_ENTITA_LABEL[t]}
                          </button>
                        ))}
                      </div>

                      {v.entitaSelezionata ? (
                        <div className="flex items-center justify-between bg-white border border-purple-200 rounded-lg px-2 py-1.5">
                          <p className="text-xs text-gray-700 truncate">
                            {TIPO_ENTITA_LABEL[v.entitaSelezionata.tipo]}: {v.entitaSelezionata.titolo}
                          </p>
                          <button
                            onClick={() => aggiorna(v.mailProcessataId, "entitaSelezionata", null)}
                            className="text-xs text-gray-400 hover:text-gray-600 shrink-0 ml-2"
                          >
                            ✕
                          </button>
                        </div>
                      ) : v.tipoCollegamento && (
                        <>
                          <div className="flex gap-1.5">
                            <input
                              value={v.ricercaTesto}
                              onChange={e => aggiorna(v.mailProcessataId, "ricercaTesto", e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") cercaEntita(v); }}
                              placeholder="Cerca per titolo…"
                              className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                            />
                            <button
                              onClick={() => cercaEntita(v)}
                              disabled={v.cercandoEntita || v.ricercaTesto.trim().length < 2}
                              className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white disabled:opacity-50"
                            >
                              {v.cercandoEntita ? "…" : "Cerca"}
                            </button>
                          </div>
                          {v.risultatiRicerca.length > 0 && (
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              {v.risultatiRicerca.map(r => (
                                <button
                                  key={r.id}
                                  onClick={() => aggiorna(v.mailProcessataId, "entitaSelezionata", { tipo: v.tipoCollegamento as "pratica" | "progetto" | "contestazione", id: r.id, titolo: r.titolo })}
                                  className="w-full text-left text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 hover:border-purple-300"
                                >
                                  <span className="text-gray-700">{r.titolo}</span>
                                  <span className="text-gray-400 ml-1">({r.stato})</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      <p className="text-[11px] text-gray-500">
                        Verrà aggiunta una nota (+ eventuali allegati) all&apos;entità scelta, senza creare nulla di nuovo.
                      </p>
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
                      {(v.binario === "MANUALE" || v.binario === "INCERTO") && (
                        <button
                          onClick={() => aggiorna(v.mailProcessataId, "modalitaManuale", "collega_esistente")}
                          className="text-xs text-purple-600 hover:underline text-left"
                        >
                          🔗 Collega a un&apos;entità esistente invece
                        </button>
                      )}

                      {/* Selettore ad albero completo — sempre disponibile, indipendentemente dal
                          binario di partenza della riga (redesign 2026-07-24). */}
                      <div>
                        <label className="text-xs text-gray-500">Etichetta</label>
                        <select
                          value={v.etichettaScelta}
                          onChange={e => sceltaEtichetta(v, e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none"
                        >
                          <option value="">Seleziona…</option>
                          {GRUPPI_ORDINE.map(gruppo => (
                            <optgroup key={gruppo} label={gruppo}>
                              {ALBERO_ETICHETTE_MAIL.filter(n => gruppoDiEtichetta(n.etichetta) === gruppo).map(n => (
                                <option key={n.etichetta} value={n.etichetta}>{etichettaBreve(n.etichetta)}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      {opzioni && (
                        <div>
                          <label className="text-xs text-gray-500">Stato iniziale</label>
                          <select
                            value={v.stato}
                            onChange={e => aggiorna(v.mailProcessataId, "stato", e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none"
                          >
                            {opzioni.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {categoriaRisolta === "progetto" && (
                        <div>
                          <label className="text-xs text-gray-500">Tipo</label>
                          <select
                            value={v.tipoProgetto || "PROGETTO"}
                            onChange={e => aggiorna(v.mailProcessataId, "tipoProgetto", e.target.value as TipoProgetto)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none"
                          >
                            {(Object.keys(TIPO_PROGETTO_LABEL) as TipoProgetto[]).map(t => (
                              <option key={t} value={t}>{TIPO_PROGETTO_LABEL[t]}</option>
                            ))}
                          </select>
                          <p className="text-[11px] text-gray-400 mt-1">
                            {v.caricandoTipoProgetto ? "Ipotesi AI in corso…" : v.tipoProgettoSuggerito ? `Ipotesi AI: ${TIPO_PROGETTO_LABEL[v.tipoProgettoSuggerito]} — sempre modificabile.` : "Nessuna ipotesi disponibile — scegli tu."}
                          </p>
                        </div>
                      )}

                      {eCategoriaManuale(categoriaRisolta) && (
                        <div>
                          <label className="text-xs text-gray-500">Titolo / Oggetto</label>
                          <input
                            value={v.titolo}
                            onChange={e => aggiorna(v.mailProcessataId, "titolo", e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      )}

                      {categoriaRisolta === "contestazione" ? (
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
                      ) : categoriaRisolta === "segnalazione" && (
                        <div>
                          <label className="text-xs text-gray-500">Delega</label>
                          <select
                            value={v.delega}
                            onChange={e => aggiorna(v.mailProcessataId, "delega", e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none"
                          >
                            <option value="">— da specificare —</option>
                            {(Object.keys(DELEGHE_LABEL) as Delega[]).map(d => (
                              <option key={d} value={d}>{DELEGHE_LABEL[d]}</option>
                            ))}
                          </select>
                          {!v.delega && (
                            <p className="text-[11px] text-orange-600 mt-1">Nessuna ipotesi — scegli tu prima di confermare.</p>
                          )}
                        </div>
                      )}

                      {categoriaRisolta === "segnalazione" && (
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
                      ((v.binario === "MANUALE" || v.binario === "INCERTO") && v.modalitaManuale === "collega_esistente"
                        ? !v.entitaSelezionata
                        : !v.etichettaScelta || (categoriaRisolta === "segnalazione" && !v.delega))
                    }
                    className={`w-full text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 ${
                      (v.binario === "PROPOSTA_CONTINUAZIONE" && v.modalitaProposta === "collega") ||
                      ((v.binario === "MANUALE" || v.binario === "INCERTO") && v.modalitaManuale === "collega_esistente")
                        ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    {confermando === v.mailProcessataId
                      ? "Conferma…"
                      : v.candidatiOdg
                      ? "✓ Conferma con questo file"
                      : (v.binario === "PROPOSTA_CONTINUAZIONE" && v.modalitaProposta === "collega") ||
                        ((v.binario === "MANUALE" || v.binario === "INCERTO") && v.modalitaManuale === "collega_esistente")
                      ? "🔗 Collega"
                      : "✓ Conferma"}
                  </button>
                </div>
              )}
            </div>
            );
          })}

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
