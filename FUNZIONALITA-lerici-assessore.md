---
name: funzionalita-lerici-assessore
description: "Panoramica funzionale del tool lerici-assessore — cosa fa oggi, sezione per sezione"
metadata:
  node_type: memory
  type: project
  generato: 2026-07-26
  aggiornato: 2026-07-26
  nota: "Verificato contro il codice reale il 2026-07-26 — vedi 'Aggiornato' più sotto per le correzioni."
---

# lerici-assessore — panoramica funzionale

App Next.js + Prisma + PostgreSQL (Supabase) per la gestione delle attività di Marco Muro come Assessore del Comune di Lerici. Deploy su Vercel.

## Sidebar / sezioni principali

Menu principale: Segnalazioni, Nuova, Mail, Dashboard, Politica, Riunioni. Menu secondario "Altro": Agenda, Rubrica, Bandi, Contestazioni, Giustifiche.

- **Segnalazioni** (in origine "Dashboard") — problemi operativi segnalati da cittadini/enti
- **Nuova** (➕) — form dedicato di creazione rapida di una Segnalazione o di una "Mia idea", con scorciatoie di titolo per delega (vedi `SOTTOCATEGORIE` più sotto)
- **Mail** — schermata di revisione/importazione della posta in arrivo, alimentata dal motore di scansione automatico
- **Dashboard** (in origine "Progetti") — Progetti e Attività amministrative legate alle deleghe, più la categoria "Varie"
- **Attività Politico-Amministrativa** ("Politica") — Consiglio Comunale, Commissioni, Giunta, Mozioni, Interrogazioni, DUP
- **Riunioni** — checklist vocale per incontri con capi settore
- **Agenda** (📅, in origine "Appuntamenti") — modello `Appuntamento` a sé, collegabile opzionalmente a una Pratica, sincronizzazione Google Calendar (se `GOOGLE_REFRESH_TOKEN` configurato)
- **Rubrica** — contatti (Persona)
- **Bandi** — monitoraggio bandi pubblici per opportunità di finanziamento
- **Contestazioni** — reclami formali del Comune verso i gestori di servizi
- **Giustifiche** — checklist di inoltro giustificativi al datore di lavoro

---

## Segnalazioni

Modello `Pratica` (tipi: SEGNALAZIONE, e storicamente MIA_IDEA — quest'ultimo tipo ormai svuotato, le idee promosse sono migrate a Progetto).

- Sidebar con le 10 deleghe, conteggi per delega
- Tab Operativa/Archivio
- Filtri per delega, tipo e stato; ordinamento anche per priorità
- Diario evoluzioni (note in ordine cronologico inverso)
- Foto/documenti allegati
- Referente con pulsanti Telegram/Email/WhatsApp (componente condiviso `ReferenteBox`, riusato anche da Progetti e Atti)
- **`SOTTOCATEGORIE`** (`lib/constants.ts`): non un modello DB né un campo salvato — un oggetto TypeScript hardcoded (delega → lista di titoli tipici, es. "Lampione spento", "Buca stradale") usato solo come scorciatoia nel form "Nuova" per precompilare il titolo. Non filtrabile, non persistito; aggiungere una voce richiede una modifica al codice (non una migrazione DB, ma nemmeno editabile da interfaccia)
- Export PDF/Excel

## Progetti / Dashboard

Modello `Progetto` — separato da Segnalazioni, per iniziative amministrative più strutturate.

- **Campo `tipo`**: `PROGETTO` (iniziativa con inizio/fine) o `ATTIVITA` (operatività corrente legata a una delega, senza necessariamente un traguardo definito) — badge visivo, filtro dedicato
- **Campo `delega`** (opzionale) oppure **`categoriaVaria`**: `COMUNICAZIONI | ANCI | REGIONE | GOVERNO`, mutuamente esclusivi — sidebar con due gruppi separati ("Deleghe" e "Varie")
- Priorità, stato (`IN_CORSO/SOSPESO/CONCLUSO/ARCHIVIATO`), diario note, documenti, responsabile con `ReferenteBox`
- Filtri, vista compatta, export

## Attività Politico-Amministrativa ("Politica")

Modello `AttoPoliticoAmministrativo` — copre l'intera attività istituzionale ricorrente.

**Tipi**: `CONVOCAZIONE_CONSIGLIO`, `CONVOCAZIONE_COMMISSIONE`, `CONVOCAZIONE_GIUNTA`, `MOZIONE`, `INTERROGAZIONE`, `DELIBERA`, `DETERMINA`, `DUP` — tutti creano una vera riga tracciabile (nessuna categoria "solo etichetta senza entità" residua).

- **Estrazione ordine del giorno**: per Convocazioni, PDF/DOCX → testo → riformattato in elenco puntato via Claude Haiku. Per DUP: solo estrazione testo grezzo, senza riformattazione AI (per scelta esplicita)
- **Gestione zip** (Convocazioni Consiglio): decompressione, euristica per individuare il file ODG tra le pratiche allegate; se ambiguo, si ferma per scelta manuale invece di indovinare
- **Verbali di Giunta**: si agganciano automaticamente alla Convocazione corrispondente (match per data/oggetto), archiviano l'Atto
- **Mozioni/Interrogazioni**: collegamento opzionale al Consiglio in cui vanno discusse (obbligo di risposta)
- Responsabile con `ReferenteBox`, diario evoluzioni (`NotaAtto`)
- Documenti: PDF/DOC/DOCX/RTF/ZIP/immagini, mai i binari nel DB — solo su Supabase Storage

## Contestazioni

Modello `Contestazione` — reclami del Comune verso i gestori di servizi.

- Gestori: `ACAM_AMBIENTE | ACAM_ACQUE | ATC | ENEL`
- Esiti: `IN_ATTESA | RISOLTO | RESPINTO | SENZA_RISPOSTA`
- Tab Operativa (`IN_ATTESA`) / Archivio (tutto il resto)
- Vista aggregata per gestore/mese, utile per individuare pattern ricorrenti
- Diario note (`NotaContestazione`), documenti

## Giustifiche

Modello `Giustifica` — giustificativi ricevuti dagli uffici da inoltrare al datore di lavoro.

- Checklist con badge "da vedere" (appena arrivata) e "da inoltrare" (vista ma non ancora girata)
- Documenti allegati

## Riunioni

Modello `Riunione` + `ArgomentoRiunione` — checklist vocale per preparare e seguire incontri.

- Collegabile a una Persona (Rubrica) e/o a un Progetto, oppure lista libera
- **3 stati**: `IN_PREPARAZIONE` (sempre modificabile, argomenti e ogni altro dato) → `IN_CORSO` (checkbox per spuntare gli argomenti trattati) → `CONCLUSA` (riapribile, torna a IN_PREPARAZIONE)
- **Trascrizione vocale**: Web Speech API del browser (gratis, live, Android Chrome)
- **Generazione checklist**: trascrizione grezza → Claude Haiku → elenco puntato, sempre rivedibile prima di salvare

## Agenda (Appuntamenti)

Modello `Appuntamento` — a sé, non annidato in Pratica.

- Collegabile opzionalmente a una Pratica (`praticaId`)
- Titolo, descrizione, luogo, data/ora
- **Sincronizzazione Google Calendar**: se `GOOGLE_REFRESH_TOKEN` è configurato, alla creazione viene creato anche l'evento su Calendar (`googleEventId` salvato per riferimento) — un fallimento della sync non blocca la creazione dell'appuntamento

## Rubrica

Modello `Persona` — contatti, referenti per capi settore e gestori.

- Campi: nome, ruolo, azienda (mostrato dopo il ruolo), email principale, email secondaria (solo in dettaglio), telefono
- Riferimento per il `ReferenteBox` condiviso su Segnalazioni/Progetti/Atti

## Bandi

Monitoraggio automatico di bandi pubblici (nazionali/regionali/provinciali) rilevanti per un Comune di ~10.000 abitanti.

- **4 fonti attive**: Conferenza Stato-Città, x-desk Info Bandi, ANCI Liguria, UPEL — tutte con estrazione via Claude (non più selettori CSS/regex, troppo fragili ai redesign dei siti)
- **ANCI Nazionale**: parser scritto (`lib/bandi/fonti/anci-nazionale.ts`) ma disattivato temporaneamente nel codice (troppo rumoroso, mescola webinar/eventi ai bandi veri) — da riattivare quando le 4 fonti attive sono stabili
- **Regione Liguria**: parser scritto e completo (`lib/bandi/fonti/regione-liguria.ts`, presente fin dal primo commit Bandi) ma **non incluso** nell'elenco fonti attive in `lib/bandi/index.ts` — nessun commento nel codice spiega il motivo. Verificare se riattivarlo o se c'è una ragione (es. robots.txt) da documentare esplicitamente prima di scartare il file
- **Incentivi.gov.it**: nessun parser scritto, controllo resta manuale
- Campi estratti: titolo, ente, dotazione, beneficiari, scadenza, ambito territoriale, soglia di popolazione, tipo beneficiario (ente pubblico/impresa/misto/cittadino)
- Deduplica via hash su URL del bando (non più sul titolo, che l'AI può riformulare leggermente run su run)
- Stato bando: NUOVO/VALUTATO/INTERESSANTE/SCARTATO/SCADUTO — scarto non distruttivo (mai cancellazione fisica, altrimenti si romperebbe la deduplica)
- Filtro per fonte, stato, delega
- Cron 3 volte a settimana, notifica Telegram, contatori di estrazione (candidati/estratti/falliti) sempre loggati con alert dedicato in caso di fallimenti

## Motore mail — il cuore dell'automazione

Tabella `MailProcessata` come unica fonte di verità su cosa è stato importato (non più le sole etichette Gmail).

**Binari di classificazione**:
- **Automatico**: Consiglio Comunale (+ sottotipi), Giunta (+ sottotipi inclusi ora Delibere/Determine/DUP), Giustifica, categorie "Varie" instradate per dominio mittente (ANCI/Regione/Governo) — crea l'entità senza conferma preventiva, badge di notifica dopo
- **Manuale**: Segnalazioni, Deleghe→Progetto, Contestazioni, Comunicazioni — richiede conferma esplicita prima di ogni azione
- **Incerto**: nessuna categoria proposta con sufficiente confidenza, scelta libera da zero
- **Non rilevante**: mail estranee al lavoro (newsletter, ecc.) — smaltite subito, etichettate, nessuna attesa
- **Proposta continuazione**: match debole (oggetto normalizzato + mittente) con un'entità già esistente — richiede conferma con un tap

**Classificazione**: regole primarie (etichette Gmail affidabili, domini mittente) prima di tutto; classificazione AI (Claude Haiku) solo per i casi residui.

**Tree-picker**: ogni mail nella schermata di revisione mostra un badge con l'etichetta specifica proposta (es. "Deleghe/Viabilità"), sempre correggibile con un selettore ad albero completo — copre tutte le etichette reali (Consiglio Comunale, Giunta, Deleghe, Segnalazioni, Contestazioni, Giustifica, Varie). Include anche un selettore per lo stato iniziale con cui l'entità entra nel sistema, e per Progetti il tipo (Progetto/Attività).

**Catena di continuazione** (evita duplicati quando arriva una risposta a qualcosa di già gestito): protocollo → threadId Gmail → oggetto normalizzato+mittente (quest'ultimo sempre a conferma manuale, mai automatico).

**Rilevamento thread precedente**: prima di creare una nuova entità, verifica se il messaggio fa parte di un thread con messaggi precedenti non ancora processati — se sì, usa il più vecchio come vera origine (in Manuale/Incerto, con avviso in chiaro; in Automatico, si ferma per revisione).

**Mittente reale negli inoltri**: quando una mail è un inoltro, individua ed espone il vero mittente originale (nascosto nel testo citato), non solo chi ha girato il messaggio.

**Collegamento manuale**: dalla coda di revisione, possibilità di agganciare una mail a un'entità esistente (Pratica/Progetto/Contestazione/Atto) cercandola liberamente, invece di crearne una nuova per errore.

**Testo completo on-demand**: pulsante su ogni entità con `messageId` per recuperare dal vivo il corpo pieno della mail originale da Gmail, anche per entità create prima di questo fix.

**Igiene della casella**: le mail gestite vengono archiviate fuori da INBOX (mai cancellate se non esplicitamente, e solo nel Cestino recuperabile) solo dopo che l'etichetta corretta è stata applicata con successo — mai il contrario.

**Cron**: 1 volta al giorno (7:00, `vercel.json`), backfill del pregresso alla prima esecuzione, poi solo nuovi arrivi.

---

## Note di affidabilità da tenere a mente

- Prima di fidarsi ciecamente di una nuova etichetta Gmail o di un nuovo dominio come segnale automatico, verificarne la precisione su un campione reale (lezione imparata con il filtro "Segnalazioni" troppo largo)
- Ogni azione automatica ha un meccanismo di visibilità in caso di fallimento (contatori, campi booleani tipo `archiviazioneFallita`, alert Telegram dedicati) — mai un fallimento silenzioso
- Ogni entità creata resta sempre pienamente modificabile, indipendentemente da quale binario l'ha generata
