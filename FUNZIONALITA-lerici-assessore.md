---
name: funzionalita-lerici-assessore
description: "Panoramica funzionale del tool lerici-assessore — cosa fa oggi, sezione per sezione"
metadata:
  node_type: memory
  type: project
  generato: 2026-07-26
  aggiornato: 2026-09-21
  nota: "Verificato contro il codice reale il 2026-09-21 (Fase 2 dell'automazione mail inclusa: vedi docs/Automazione mail - Fase 2/SPEC-automazione-mail-fase2.md)."
---

# lerici-assessore — panoramica funzionale

App Next.js + Prisma + PostgreSQL (Supabase) per la gestione delle attività di Marco Muro come Assessore del Comune di Lerici. Deploy su Vercel.

Vedi anche: [NOTE-TECNICHE.md](./NOTE-TECNICHE.md) per gotcha tecnici, [docs/specs-storiche/](./docs/specs-storiche/) per il "perché" delle decisioni di design delle feature già implementate.

## Sidebar / sezioni principali

Menu principale: Segnalazioni, Nuova, Mail, Dashboard, Politica, Riunioni. Menu secondario "Altro": Agenda, Rubrica, Bandi, Contestazioni, Giustifiche.

- **Segnalazioni** (in origine "Dashboard") — problemi operativi segnalati da cittadini/enti
- **Nuova** (➕) — form dedicato di creazione rapida di una Segnalazione o di una "Mia idea", con scorciatoie di titolo per delega (vedi `SOTTOCATEGORIE` più sotto)
- **Mail** — schermata di revisione/importazione della posta in arrivo, alimentata dal motore di scansione automatico
- **Dashboard** (in origine "Progetti") — Progetti e Attività amministrative legate alle deleghe oppure a un ente/associazione (`EnteVario`, gruppo "Istituzioni" su Gmail)
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
- **Etichette Gmail**: ogni Segnalazione confermata riceve `Segnalazioni/<Delega>` (nomi reali di `ETICHETTA_DELEGA`, non `DELEGHE_LABEL`), più l'eventuale sotto-tema (`Segnalazioni/<Delega>/<SottoTema>`). Quando la Pratica passa a CHIUSA il tool sposta la mail in `.../Risolta` (per delega, o annidata sotto il sotto-tema già presente sul messaggio); vale anche il contrario — una mail spostata a mano in una `Risolta` chiude la Pratica (riconciliazione, vedi Motore mail)
- **Luogo**: campo `luogo` libero; in revisione mail viene precompilato con la zona estratta da Claude (`classificaZona`, ancorata alle frazioni/località di Lerici in `lib/claude.ts`), sempre modificabile
- **`SottoTema`** (Fase 2, 2026-09-15): livello facoltativo sotto la Delega, modello DB (non enum) estendibile al volo dal form — stesso principio di `Gestore`/`EnteVario`. Rispecchia i sotto-temi che Marco gestiva a mano solo su Gmail (es. "Segnalazioni/Ciclo Rifiuti/Mancati Ritiri"). Mai obbligatorio. Selezionabile in conferma mail, creazione manuale ("Nuova") e modifica pratica; filtrabile anche nella lista principale (appare solo quando è già scelta una delega con sotto-temi noti)
- Tab Operativa/Archivio
- Filtri per delega, sotto-tema, tipo e stato; ordinamento anche per priorità
- Diario evoluzioni (note in ordine cronologico inverso)
- Foto/documenti allegati
- Referente con pulsanti Telegram/Email/WhatsApp (componente condiviso `ReferenteBox`, riusato anche da Progetti e Atti)
- **`SOTTOCATEGORIE`** (`lib/constants.ts`): non un modello DB né un campo salvato — un oggetto TypeScript hardcoded (delega → lista di titoli tipici, es. "Lampione spento", "Buca stradale") usato solo come scorciatoia nel form "Nuova" per precompilare il titolo. Non filtrabile, non persistito; aggiungere una voce richiede una modifica al codice (non una migrazione DB, ma nemmeno editabile da interfaccia)
- Export PDF/Excel

## Progetti / Dashboard

Modello `Progetto` — separato da Segnalazioni, per iniziative amministrative più strutturate.

- **Campo `tipo`**: `PROGETTO` (iniziativa con inizio/fine) o `ATTIVITA` (operatività corrente legata a una delega, senza necessariamente un traguardo definito) — badge visivo, filtro dedicato
- **Campo `delega`** (opzionale) oppure **`enteVarioId`** (modello `EnteVario`, non più un enum): mutuamente esclusivi. Seed: Comunicazioni, ANCI, Regione, Governo, Questura della Spezia, Carabinieri (Lerici, Sarzana, Comando Provinciale, La Spezia), Vigili del Fuoco — e **estendibile al volo** dai form ("+ Nuovo ente…") senza migration. Su Gmail l'albero è `Istituzioni/<ente>` (in origine `Varie/<ente>`, rinominato il 2026-09-15). Le mail di ANCI/Regione/Governo sono instradate per dominio mittente
- Priorità, stato (`IN_CORSO/SOSPESO/CONCLUSO/ARCHIVIATO`), diario note, documenti, responsabile con `ReferenteBox`
- Filtri, vista compatta, export

## Attività Politico-Amministrativa ("Politica")

Modello `AttoPoliticoAmministrativo` — copre l'intera attività istituzionale ricorrente.

**Tipi**: `CONVOCAZIONE_CONSIGLIO`, `CONVOCAZIONE_COMMISSIONE`, `CONVOCAZIONE_GIUNTA`, `MOZIONE`, `INTERROGAZIONE`, `DELIBERA`, `DETERMINA`, `DUP`, `BILANCIO` — tutti creano una vera riga tracciabile. Unica eccezione voluta nel motore mail: le mail in entrata dei gestori esterni ricevono solo l'etichetta `Gestori/<nome>` (vedi Motore mail).

- **Estrazione ordine del giorno**: per Convocazioni, PDF/DOCX → testo → riformattato in elenco puntato via Claude Haiku. Per DUP: solo estrazione testo grezzo, senza riformattazione AI (per scelta esplicita)
- **Gestione zip** (Convocazioni Consiglio): decompressione, euristica per individuare il file ODG tra le pratiche allegate; se ambiguo, si ferma per scelta manuale invece di indovinare
- **Verbali di Giunta**: si agganciano automaticamente alla Convocazione corrispondente (match per data/oggetto), archiviano l'Atto
- **Mozioni/Interrogazioni**: collegamento opzionale al Consiglio in cui vanno discusse (obbligo di risposta)
- Responsabile con `ReferenteBox`, diario evoluzioni (`NotaAtto`)
- Documenti: PDF/DOC/DOCX/RTF/ZIP/immagini, mai i binari nel DB — solo su Supabase Storage

## Contestazioni

Modello `Contestazione` — reclami del Comune verso i gestori di servizi.

- **Gestori**: modello `Gestore` (non più un enum), estendibile al volo. Seed: ACAM Ambiente, ACAM Acque, ATC Esercizio, Enel, Maris, Ato Rifiuti
- Le contestazioni le apre il Comune; una mail *mandata* da un gestore non è una contestazione (vedi Motore mail → Gestori in entrata) — una loro risposta si aggancia alla contestazione aperta tramite la catena di continuazione
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
- **Regione Liguria**: parser scritto e completo (`lib/bandi/fonti/regione-liguria.ts`, presente fin dal primo commit Bandi) ma non incluso nell'elenco fonti attive in `lib/bandi/index.ts` — motivo ora commentato direttamente nel codice: `regione.liguria.it` blocca tutti i bot generici via robots.txt (verificato luglio 2026). Stesso motivo per `incentivi.gov.it`, mai scritto come parser. Entrambe restano a controllo manuale periodico — dettagli completi in [docs/specs-storiche/SPEC-feature-bandi.md](./docs/specs-storiche/SPEC-feature-bandi.md), sezione 1
- **Incentivi.gov.it**: nessun parser scritto, controllo resta manuale
- Campi estratti: titolo, ente, dotazione, beneficiari, scadenza, ambito territoriale, soglia di popolazione, tipo beneficiario (ente pubblico/impresa/misto/cittadino)
- Deduplica via hash su URL del bando (non più sul titolo, che l'AI può riformulare leggermente run su run)
- Stato bando: NUOVO/VALUTATO/INTERESSANTE/SCARTATO/SCADUTO — scarto non distruttivo (mai cancellazione fisica, altrimenti si romperebbe la deduplica)
- Filtro per fonte, stato, delega
- Cron 3 volte a settimana, notifica Telegram, contatori di estrazione (candidati/estratti/falliti) sempre loggati con alert dedicato in caso di fallimenti

## Motore mail — il cuore dell'automazione

Tabella `MailProcessata` come unica fonte di verità su cosa è stato importato (non più le sole etichette Gmail).

**Binari di classificazione**:
- **Automatico**: Consiglio Comunale (+ sottotipi), Giunta (+ sottotipi: Delibere/Determine), Giustifica, enti istituzionali instradati per dominio mittente (ANCI/Regione/Governo → `Istituzioni/...`), mail dei gestori esterni riconosciute per indirizzo (→ `Gestori/...`, solo etichetta) — crea l'entità (dove prevista) senza conferma preventiva, badge di notifica dopo. Il cron esegue l'Automatico solo dopo la prima conferma umana di una vera creazione (gate `primaEsecuzione`)
- **Manuale**: Segnalazioni, Deleghe→Progetto, Contestazioni, Comunicazioni, Giunta/DUP e Giunta/Bilancio (riconosciute per parola chiave nell'oggetto) — richiede conferma esplicita prima di ogni azione
- **Incerto**: nessuna categoria proposta con sufficiente confidenza, scelta libera da zero
- **Non rilevante**: mail estranee al lavoro (newsletter, ecc.) — smaltite subito, etichettate, nessuna attesa
- **Proposta continuazione**: match debole (oggetto normalizzato + mittente) con un'entità già esistente — richiede conferma con un tap

**Classificazione** (ordine in `classificaESalva`): continuazione forte (protocollo/threadId) → etichetta Gmail nota → dominio mittente (Istituzioni) → indirizzo mittente esatto (Gestori) → parola chiave (DUP/Bilancio) → classificazione AI (Claude Haiku, richiede `ANTHROPIC_API_KEY` su Vercel — vedi NOTE-TECNICHE #25) → continuazione debole → Incerto. La delega proposta viene da parole chiave (`classificaDelega`, `lib/classificatore.ts`: le parole generiche sui rifiuti puntano a Ciclo Rifiuti, non ad Ambiente); `classificaSottoTema` propone un sotto-tema noto per la delega risolta.

**Tree-picker**: ogni mail nella schermata di revisione mostra un badge con l'etichetta specifica proposta (es. "Deleghe/Viabilità"), sempre correggibile con un selettore ad albero completo — copre tutte le etichette reali (Consiglio Comunale, Giunta, Deleghe, Segnalazioni, Contestazioni, Giustifica, Istituzioni, Gestori). Include anche un selettore per lo stato iniziale con cui l'entità entra nel sistema, per Progetti il tipo (Progetto/Attività) e l'ente (o "+ Nuovo ente"), per Contestazioni il gestore, per Segnalazioni delega, **sotto-tema** (facoltativo, "+ Nuovo sotto-tema") e luogo. Scegliendo "Segnalazione" su una riga che non nasceva come tale, luogo/delega/sotto-tema vengono suggeriti al volo (`/api/motore-mail/[id]/suggerimenti-segnalazione`). Il caricamento della coda fa una sola fetch al server per pagina: le liste gestori/enti/sotto-temi si risolvono in locale (una versione precedente rifaceva il fetch fino a 4 volte e superava la quota Gmail).

**Catena di continuazione** (evita duplicati quando arriva una risposta a qualcosa di già gestito): protocollo → threadId Gmail → oggetto normalizzato+mittente (quest'ultimo sempre a conferma manuale, mai automatico).

**Rilevamento thread precedente**: prima di creare una nuova entità, verifica se il messaggio fa parte di un thread con messaggi precedenti non ancora processati — se sì, usa il più vecchio come vera origine (in Manuale/Incerto, con avviso in chiaro; in Automatico, si ferma per revisione).

**Mittente reale negli inoltri**: per le PEC nome/email vengono dalla busta di certificazione; per le mail Gmail normali inoltrate (`lib/gmail.ts` + `estraiMittenteReale` in `lib/inoltro.ts`) il nome/email mostrati in revisione sono quelli del cittadino originale, non di chi ha girato il messaggio; il popup "Mail originale" mostra anche il mittente reale estratto. Best-effort: i formati di inoltro variano.

**Enti riconosciuti per indirizzo**: Questura, Carabinieri, Vigili del Fuoco e ISA 10 (tabella `ENTI_ENTRATA` in `lib/classificatore.ts`, indirizzo esatto) sono Automatici come ANCI/Regione/Governo: Progetto (Attività) sotto l'ente, etichetta `Istituzioni/<ente>`. ANCI/Regione/Governo sono instradati per dominio e per gli indirizzi PEC reali noti (Prefettura, PNRR Istruzione, ANCI Liguria).

**Gestori in entrata**: una mail che arriva da un indirizzo esatto di un gestore noto (ACAM Ambiente/Acque, ATC Esercizio, Enel, Maris, Ato Rifiuti — tabella `GESTORI_ENTRATA`, match per indirizzo, mai per dominio nudo) riceve solo l'etichetta `Gestori/<nome>`, senza creare nessuna Contestazione (decisione del 2026-09-21: non sono contestazioni; le apre il Comune e il gestore risponde). Se la mail risponde a una contestazione già tracciata, la continuazione forte la aggancia a quella prima di questa regola.

**Riconciliazione Gmail→tool**: a ogni giro del cron, per un numero limitato di righe già completate (`riconciliaEtichette`, tetto basso per la quota Gmail) allinea il DB a spostamenti fatti a mano su Gmail — delega/sotto-tema della Pratica, delega/ente del Progetto, chiusura via sotto-etichetta `Risolta`. Solo UPDATE su entità esistenti, mai creazione/cancellazione ("DB prima di Gmail"); con etichette di alberi diversi contemporaneamente (residui) segnala un conflitto invece di indovinare.

**Pulizia etichette**: alla conferma (e su "Non rilevante") il tool rimuove anche `Incerto/Da classificare` e le altre etichette di classificazione in conflitto con la scelta finale.

**Collegamento manuale**: dalla coda di revisione, possibilità di agganciare una mail a un'entità esistente (Pratica/Progetto/Contestazione/Atto) cercandola liberamente, invece di crearne una nuova per errore.

**Testo completo on-demand**: pulsante su ogni entità con `messageId` per recuperare dal vivo il corpo pieno della mail originale da Gmail, anche per entità create prima di questo fix.

**Igiene della casella**: le mail gestite vengono archiviate fuori da INBOX (mai cancellate se non esplicitamente, e solo nel Cestino recuperabile) solo dopo che l'etichetta corretta è stata applicata con successo — mai il contrario.

**Cron**: 1 volta al giorno (7:00, `vercel.json`), backfill del pregresso alla prima esecuzione, poi solo nuovi arrivi. **Quota Gmail**: la pagina di revisione fa più chiamate Gmail per riga (limite "Total Query Cost" per minuto, già superato in produzione): un errore Gmail su una riga la salta senza far fallire la pagina, e "Carica altre" mostra l'errore invece di bloccarsi in silenzio.

---

## Note di affidabilità da tenere a mente

- Prima di fidarsi ciecamente di una nuova etichetta Gmail o di un nuovo dominio come segnale automatico, verificarne la precisione su un campione reale (lezione imparata con il filtro "Segnalazioni" troppo largo)
- Ogni azione automatica ha un meccanismo di visibilità in caso di fallimento (contatori, campi booleani tipo `archiviazioneFallita`, alert Telegram dedicati) — mai un fallimento silenzioso
- Ogni entità creata resta sempre pienamente modificabile, indipendentemente da quale binario l'ha generata
