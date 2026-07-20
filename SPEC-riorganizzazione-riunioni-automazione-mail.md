---
name: spec-riorganizzazione-riunioni-automazione-mail
description: "Specifica tecnica unificata: separazione Segnalazioni/Progetti/Attività Politico-Amministrativa, automazione classificazione mail PEC, e feature Riunioni (registrazione vocale + checklist) in lerici-assessore"
metadata:
  node_type: spec
  type: feature
  project: lerici-assessore
  created: 2026-07-15
  supersedes: [spec-riorganizzazione-e-automazione-mail, spec-feature-riunioni]
---

# Riorganizzazione, automazione mail PEC e Riunioni vocali

## Obiettivo generale

Oggi tutto passa per un unico modello `Pratica` (Segnalazioni + Progetti mischiati) alimentato da un'importazione mail manuale e mirata (solo etichetta Gmail "Segnalazioni"). Il volume reale di PEC che arriva sulla casella `marco.muro@comune.lerici.sp.it` è molto più ampio ed eterogeneo. A questo si aggiunge l'esigenza di uno strumento rapido per preparare, con la voce, checklist di argomenti da trattare nelle riunioni con capi settore e altri interlocutori.

Questa spec copre tre evolutive correlate, pensate insieme perché condividono modelli (Persona, Progetto), pattern UI (diario, documenti, conferma prima delle azioni pesanti) e un building block tecnico comune (estrazione testo → API Claude → elenco puntato):

1. **Separare in sezioni distinte** nella sidebar: Segnalazioni (esistente, invariata), Progetti (nuova), Attività Politico-Amministrativa (nuova), Contestazioni (nuova), Giustifiche (nuova), Riunioni (nuova)
2. **Automatizzare la classificazione** di tutta la posta in arrivo, su **tre binari distinti**: automatico con notifica a posteriori per le categorie ad alta confidenza, conferma umana prima di ogni azione per le categorie ambigue, e un tier "Incerto" per i casi che nessuno dei due riesce a risolvere — orchestrati da un motore di scansione schedulato (non più a trigger manuale) con un log di verità nel DB — vedi sezione 6
3. **Riunioni**: checklist vocale per preparare e seguire incontri con capi settore (o altri), collegabile sia a una Persona sia — novità di questa unificazione — a un Progetto

---

## 1. Struttura sidebar

```
📋 Segnalazioni       (esistente, nessuna modifica al modello Pratica/SEGNALAZIONE)
📁 Progetti            (nuovo — ex TipoPratica.PROGETTO, ora modello a parte)
🏛️ Attività Politico-Amministrativa   (nuovo)
⚠️ Contestazioni        (nuovo — verso ACAM Ambiente / ACAM Acque / ATC)
📝 Giustifiche          (nuovo — checklist inoltro al datore di lavoro)
🎙️ Riunioni             (nuovo — checklist vocale per incontri)
👥 Rubrica
📢 Bandi                (da altra evolutiva, in pausa)
```

`TipoPratica.PROGETTO` va deprecato e migrato al nuovo modello `Progetto` (script di migrazione dati una tantum se ci sono già pratiche di tipo PROGETTO in produzione — verificare in fase di implementazione).

---

## 2. Modello Progetto (amministrativo, separato da Segnalazioni)

```prisma
model Progetto {
  id                  String         @id @default(cuid())
  titolo              String
  delega              Delega
  stato               StatoProgetto  @default(IN_CORSO)
  responsabileId       String?        // FK opzionale verso Persona (capo settore) — riusa Rubrica
  responsabile         Persona?       @relation(fields: [responsabileId], references: [id])
  fonteFinanziamento   String?        // testo libero, opzionale; in futuro può linkare a Bando
  bandoId              String?        // FK opzionale, per quando esisterà la feature Bandi
  descrizione          String?
  note                 NotaProgetto[]
  documenti            DocumentoProgetto[]
  riunioni             Riunione[]     // NEW — riunioni legate a questo progetto (vedi sezione 4)
  messageId            String?        // se creato da import mail automatico
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt
}

enum StatoProgetto {
  IN_CORSO
  SOSPESO
  CONCLUSO
  ARCHIVIATO
}

model NotaProgetto {
  id          String    @id @default(cuid())
  progettoId  String
  progetto    Progetto  @relation(fields: [progettoId], references: [id], onDelete: Cascade)
  testo       String
  createdAt   DateTime  @default(now())
}

model DocumentoProgetto {
  id          String    @id @default(cuid())
  progettoId  String
  progetto    Progetto  @relation(fields: [progettoId], references: [id], onDelete: Cascade)
  nomeFile    String
  storageUrl  String     // Supabase Storage, stesso bucket pattern delle Foto su Pratica
  createdAt   DateTime  @default(now())
}
```

Responsabile e fonte di finanziamento **opzionali fin dalla creazione**, come confermato — compilabili anche in un secondo momento dalla scheda Progetto.

Diario evoluzioni (`NotaProgetto`) e documenti riusano esattamente lo stesso pattern UI già collaudato su Pratica (diario in ordine inverso, tile per i documenti).

---

## 2bis. Categorie operative per Segnalazioni (sotto-etichette Gmail)

Le sotto-etichette di "Segnalazioni" (Ingombranti, Lavaggio strade, Sfalci, Rifiuti...) sono un livello di dettaglio **diverso e più fine della Delega**: più categorie possono ricadere sulla stessa delega, e servono a capire rapidamente con chi interfacciarsi operativamente, non quale competenza politica è coinvolta. Vanno tenute come dimensione separata, non forzate dentro l'enum `Delega`.

```prisma
model CategoriaSegnalazione {
  id       String  @id @default(cuid())
  nome     String  @unique   // "Ingombranti", "Lavaggio strade", "Sfalci", "Rifiuti"...
  delega   Delega?           // a quale delega ricade di solito (opzionale, per raggruppare/filtrare)
  pratiche Pratica[]
}
```

Aggiungere `categoriaId String?` + relazione su `Pratica` esistente.

**Perché un modello e non un secondo enum**: un enum richiede una migrazione di schema ogni volta che se ne aggiunge uno; con un modello, una nuova categoria operativa si aggiunge da un'interfaccia di gestione, senza intervento tecnico.

**Assegnazione referente: manuale per ora.** Il campo `referente` su Pratica resta scelto a mano come oggi, nessuna precompilazione automatica. **Nota per il futuro**: dato che poche persone gestiscono ricorrentemente le stesse categorie, in una fase successiva si potrà aggiungere un campo opzionale `referenteDefaultId` su `CategoriaSegnalazione` per suggerire (non imporre) il referente abituale — rimandato, non necessario alla prima implementazione.

---

## 3. Modello Attività Politico-Amministrativa

```prisma
model AttoPoliticoAmministrativo {
  id                  String      @id @default(cuid())
  tipo                TipoAtto
  dataSeduta          DateTime?   // opzionale: mozioni/interrogazioni non hanno seduta propria, sono legate al Consiglio successivo
  oggetto             String      // titolo/oggetto sintetico
  odgTestoEstratto    String?     @db.Text  // ordine del giorno estratto e riformattato a elenco puntato
  scadenzaRisposta    DateTime?   // solo per MOZIONE/INTERROGAZIONE, se rilevabile
  consiglioCollegatoId String?    // self-relation: la seduta di Consiglio in cui mozione/interrogazione va discussa
  consiglioCollegato   AttoPoliticoAmministrativo? @relation("RispostaInConsiglio", fields: [consiglioCollegatoId], references: [id])
  risposteCollegate    AttoPoliticoAmministrativo[] @relation("RispostaInConsiglio")
  stato               StatoAtto   @default(DA_ESAMINARE)
  visualizzato        Boolean     @default(false)  // NEW — per il badge del binario automatico (sezione 6): false finché Marco non apre la scheda
  visualizzatoAt      DateTime?
  documenti           DocumentoAtto[]
  messageId           String?
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt
}

enum TipoAtto {
  CONVOCAZIONE_GIUNTA
  CONVOCAZIONE_CONSIGLIO
  CONVOCAZIONE_COMMISSIONE
  MOZIONE
  INTERROGAZIONE
}

enum StatoAtto {
  DA_ESAMINARE
  ESAMINATO
  RISPOSTO       // per mozioni/interrogazioni
  ARCHIVIATO
}

model DocumentoAtto {
  id          String    @id @default(cuid())
  attoId      String
  atto        AttoPoliticoAmministrativo @relation(fields: [attoId], references: [id], onDelete: Cascade)
  nomeFile    String
  storageUrl  String    // Supabase Storage — bytes MAI nel DB Postgres
  ruolo       RuoloDocumento @default(PRATICA_ALLEGATA)
  createdAt   DateTime  @default(now())
}

enum RuoloDocumento {
  ORDINE_GIORNO      // il file da cui è stato estratto odgTestoEstratto (tenuto anche come originale, per riferimento)
  PRATICA_ALLEGATA    // le pratiche/documenti allegati alla convocazione, solo elencati e scaricabili
}
```

### Perché il testo dell'ODG in DB e i file no

`odgTestoEstratto` è **testo puro**, poche decine di KB anche per un consiglio lungo — nessun problema di volume nel DB relazionale. I file (PDF/DOCX/ZIP estratti) vanno tutti su Supabase Storage, esattamente come le foto delle Pratiche già oggi: il DB tiene solo `storageUrl` + nome file. Con meno di 10 Consigli l'anno, anche zip pesanti con molte pratiche allegate restano un volume di storage trascurabile — il problema "saturare il DB" semplicemente non si pone se i binari non entrano mai in Postgres.

---

## 3bis. Modello Contestazioni (verso gestori)

Mail che il Comune scrive verso ACAM Ambiente, ACAM Acque o ATC per contestare un mancato ritiro/servizio. A differenza delle Segnalazioni (dove il cittadino segnala un problema al Comune), qui è il Comune stesso a contestare al gestore — struttura diversa, niente campo "Segnalante".

```prisma
model Contestazione {
  id          String              @id @default(cuid())
  gestore     Gestore
  oggetto     String
  descrizione String?
  dataInvio   DateTime?
  esito       EsitoContestazione  @default(IN_ATTESA)
  noteEsito   String?
  documenti   DocumentoContestazione[]
  messageId   String?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
}

enum Gestore {
  ACAM_AMBIENTE
  ACAM_ACQUE
  ATC
}

enum EsitoContestazione {
  IN_ATTESA
  RISOLTO
  RESPINTO
  SENZA_RISPOSTA
}

model DocumentoContestazione {
  id              String        @id @default(cuid())
  contestazioneId String
  contestazione   Contestazione @relation(fields: [contestazioneId], references: [id], onDelete: Cascade)
  nomeFile        String
  storageUrl      String
  createdAt       DateTime      @default(now())
}
```

**Vista dedicata**: oltre all'elenco, una vista aggregata per `gestore` (conteggio contestazioni per gestore, per mese) — utile per individuare pattern ricorrenti (es. "ACAM Ambiente ha 8 contestazioni per mancato ritiro negli ultimi 3 mesi"), materiale concreto se serve documentare un problema sistemico con un gestore.

---

## 3ter. Modello Giustifiche (checklist inoltro datore di lavoro)

Le giustifiche che gli uffici comunali inviano a Marco per posta ordinaria (non PEC), da girare al suo datore di lavoro. Qui l'esigenza non è "capire cosa fare" ma **non perdere il filo su cosa è già stato inoltrato**.

```prisma
model Giustifica {
  id              String    @id @default(cuid())
  ufficioMittente String?
  oggetto         String
  dataRicezione   DateTime  @default(now())
  inoltrata       Boolean   @default(false)
  inoltrataAt     DateTime?
  visualizzata    Boolean   @default(false)  // NEW — per il badge del binario automatico (sezione 6): distinto da "inoltrata", solo per sapere se Marco l'ha vista
  visualizzataAt  DateTime?
  documenti       DocumentoGiustifica[]
  messageId       String?
  createdAt       DateTime  @default(now())
}

model DocumentoGiustifica {
  id           String     @id @default(cuid())
  giustificaId String
  giustifica   Giustifica @relation(fields: [giustificaId], references: [id], onDelete: Cascade)
  nomeFile     String
  storageUrl   String
  createdAt    DateTime   @default(now())
}
```

**UI**: vista a checklist semplice — riga per giustifica, badge "da inoltrare"/"inoltrata", un tap su `inoltrata` registra anche `inoltrataAt`. Due badge distinti in sidebar: uno rosso stile notifica per le giustifiche appena arrivate e non ancora viste (`visualizzata: false` — binario automatico, sezione 6), uno più discreto per il conteggio di quelle viste ma non ancora inoltrate al datore di lavoro (per non perdere il filo nel tempo).

---

## 4. Feature Riunioni — checklist vocale per incontri con capi settore

### Obiettivo

Strumento per preparare rapidamente, con la voce, una checklist di argomenti da trattare prima di una riunione con un capo settore (o qualsiasi altro incontro), e poterla spuntare in modo visivo e immediato durante l'incontro stesso, per non perdere il filo.

Tre modalità di collegamento, tutte da supportare:
1. **Legata a una Persona** — avviata dalla scheda di un contatto in Rubrica
2. **Legata a un Progetto** — avviata dalla scheda di un Progetto (novità di questa unificazione: prima la spec Riunioni prevedeva solo il collegamento a Persona; ha senso anche il collegamento diretto a un Progetto, dato che un incontro spesso serve a fare il punto su un progetto specifico, non solo a parlare con una persona)
3. **Lista libera** — avviata senza collegamento a nulla, per appunti generici

**Device target:** Android (Chrome) — nessun vincolo di compatibilità Safari/iOS da gestire.

### 4.1 Flusso utente

1. **Avvio registrazione** — pulsante 🎙️ (dalla scheda Persona, dalla scheda Progetto, oppure da un punto di accesso standalone in dashboard)
2. **Registrazione con trascrizione live** — Marco parla liberamente elencando gli argomenti; il testo compare a schermo mentre parla
3. **Generazione checklist** — al termine, il testo grezzo viene inviato all'API Claude che lo suddivide in punti separati (uno per argomento)
4. **Revisione** — schermata con la checklist proposta, editabile: riordina, corregge, cancella o aggiunge righe a mano, prima di salvare
5. **Salvataggio** — la `Riunione` con i suoi `ArgomentoRiunione` viene salvata in stato `PRONTA`
6. **Durante la riunione** — vista dedicata con checkbox grandi e tappabili, un tocco per spuntare ogni argomento trattato man mano
7. **Chiusura** — a fine incontro, `Riunione` passa a `CONCLUSA`; resta consultabile con lo storico di cosa è stato spuntato (e cosa no)

### 4.2 Schema dati (Prisma)

```prisma
model Riunione {
  id          String        @id @default(cuid())
  titolo      String        // es. "Riunione Lavori Pubblici" o auto-generato da data se lista libera
  personaId   String?       // FK opzionale verso Persona esistente (Rubrica)
  persona     Persona?      @relation(fields: [personaId], references: [id])
  progettoId  String?       // NEW — FK opzionale verso Progetto (sezione 2)
  progetto    Progetto?     @relation(fields: [progettoId], references: [id])
  dataOra     DateTime?     // opzionale: se non fissata, è semplicemente "in preparazione"
  stato       StatoRiunione @default(IN_PREPARAZIONE)
  trascrizioneGrezza String? @db.Text  // testo integrale della trascrizione vocale, tenuto per riferimento/audit
  argomenti   ArgomentoRiunione[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}

model ArgomentoRiunione {
  id          String    @id @default(cuid())
  riunioneId  String
  riunione    Riunione  @relation(fields: [riunioneId], references: [id], onDelete: Cascade)
  testo       String
  ordine      Int       // per il riordino manuale in fase di revisione
  spuntato    Boolean   @default(false)
  spuntatoAt  DateTime?
  createdAt   DateTime  @default(now())
}

enum StatoRiunione {
  IN_PREPARAZIONE  // registrazione in corso / checklist non ancora confermata
  PRONTA           // checklist confermata, riunione non ancora iniziata
  IN_CORSO         // riunione avviata, si stanno spuntando gli argomenti
  CONCLUSA
}
```

Aggiungere la relazione inversa `riunioni Riunione[]` sia a `Persona` sia a `Progetto` (quest'ultima già inclusa nello schema `Progetto` in sezione 2).

### 4.3 Trascrizione vocale

**Percorso primario: Web Speech API (client-side, gratis, live).** Su Android Chrome, `webkitSpeechRecognition` è supportata bene e trascrive in tempo reale in italiano (`lang: 'it-IT'`). Nessun costo, nessuna latenza percepibile.

```typescript
const recognition = new (window as any).webkitSpeechRecognition();
recognition.lang = 'it-IT';
recognition.continuous = true;
recognition.interimResults = true;

recognition.onresult = (event: SpeechRecognitionEvent) => {
  // accumula i risultati "final" in uno stato React, mostra "interim" in grigio/corsivo per feedback live
};

recognition.start();
```

Va gestita l'interruzione automatica dopo alcuni secondi di silenzio (comportamento nativo dell'API): riavviare `recognition.start()` in `onend` se l'utente non ha esplicitamente fermato la registrazione.

**Fallback: registrazione audio + Whisper API.** Se `webkitSpeechRecognition` non è disponibile (caso raro su Android Chrome, ma da gestire per robustezza): registrare l'audio con `MediaRecorder`, caricarlo su Supabase Storage, e trascriverlo lato server con l'API Whisper di OpenAI (costo per minuto trascurabile all'uso previsto). Endpoint dedicato: `POST /api/riunioni/[id]/trascrivi-audio`.

### 4.4 Generazione checklist da trascrizione (Claude API)

**Opzione scelta (principale).** Costo stimato: frazioni di centesimo per chiamata — nell'ordine di pochi euro l'anno anche con uso quotidiano. Stesso building block tecnico usato nella sezione 4 (estrazione ODG) di questa spec: testo grezzo → API Claude → elenco puntato pulito, un unico pattern riusato in due punti diversi del prodotto.

Endpoint `POST /api/riunioni/[id]/genera-checklist`:

1. Riceve `trascrizioneGrezza` (testo libero, parlato, senza punteggiatura curata)
2. Chiama l'API Claude con un prompt mirato a suddividere il testo in argomenti distinti, uno per riga, senza riassumere o perdere dettagli specifici (numeri civici, nomi, importi vanno preservati esattamente come detti)
3. Prompt richiede output **solo JSON**, array di stringhe, nessun preambolo
4. Crea le righe `ArgomentoRiunione` con `ordine` progressivo, `spuntato: false`
5. Ritorna la checklist generata per la schermata di revisione

Esempio di prompt (da adattare in fase di implementazione):

```
Sei un assistente che trasforma una nota vocale trascritta in una checklist di argomenti puntuali per una riunione.
Dividi il testo seguente in argomenti separati, uno per punto. Ogni punto deve essere una frase breve e concreta.
Mantieni intatti numeri, nomi, importi e riferimenti specifici — non riassumere, non generalizzare.
Rispondi SOLO con un array JSON di stringhe, nessun altro testo.

Testo: "{trascrizioneGrezza}"
```

**Ipotesi B (alternativa, non scelta) — zero costi, suddivisione manuale.** Se in futuro si volesse eliminare del tutto il costo (per quanto marginale) della chiamata API, la trascrizione grezza può essere mostrata direttamente nella schermata di revisione come testo unico, e Marco la spezza a mano in righe separate prima di salvare. Tenuta come opzione di ripiego, non implementata di default.

### 4.5 UI

**Punti di accesso**:
- Scheda Persona (Rubrica): pulsante "🎙️ Nuova riunione con [nome]" — crea `Riunione` con `personaId` precompilato
- Scheda Progetto: pulsante "🎙️ Nuova riunione su questo progetto" — crea `Riunione` con `progettoId` precompilato
- Dashboard: azione rapida "🎙️ Nuova riunione libera" — crea `Riunione` senza collegamenti

**Schermata di registrazione**: pulsante microfono grande, centrale, stato visivo chiaro (idle / in ascolto / in pausa); testo trascritto che scorre in tempo reale sotto il pulsante; pulsante "Genera checklist" per passare alla revisione.

**Schermata di revisione**: lista editabile degli argomenti proposti — drag per riordinare, tap per modificare il testo, swipe o pulsante per eliminare una riga; pulsante "+ aggiungi argomento" per righe manuali; pulsante "Conferma e salva" → `Riunione.stato = PRONTA`.

**Schermata "riunione in corso"**: checkbox grandi, tappabili, una riga per argomento, ordine fisso; al tap, barra diagonale sul testo + timestamp registrato in `spuntatoAt`; nessuna azione di editing qui; pulsante "Concludi riunione" → `stato = CONCLUSA`.

**Vista storico**: da scheda Persona e da scheda Progetto, elenco delle riunioni passate con indicazione argomenti trattati/non trattati — utile per la riunione successiva ("la volta scorsa non avevamo affrontato X").

---

## 5. Pipeline di estrazione ODG (Attività Politico-Amministrativa)

### Casi per tipo di atto

| Tipo | Formato ODG tipico | Altri allegati | Comportamento |
|---|---|---|---|
| **Giunta** | PDF o DOCX, singolo file | Poche pratiche, a volte DOCX/RTF | Estrai testo ODG → bullet list. Altri allegati: solo caricati su Storage e listati, nessuna estrazione testo |
| **Consiglio** | Spesso dentro uno **ZIP** insieme a tutte le pratiche | Molte pratiche (anche 10-30 file) nello stesso zip | Decomprimi zip lato server, individua il file ODG (euristica sul nome file), estrai testo → bullet list. Tutti gli altri file dello zip: caricati su Storage con `ruolo: PRATICA_ALLEGATA`, solo elencati per nome — **nessuna estrazione di testo** per non appesantire inutilmente il processo |
| **Commissione** | PDF o DOCX, singolo file | Nessuno (le pratiche sono collegate al Consiglio) | Come Giunta, solo ODG |
| **Mozione** | PDF singolo | — | Nessun ODG da estrarre: il PDF stesso è il documento, va solo reso visibile/scaricabile. `scadenzaRisposta` da collegare (se possibile) al prossimo Consiglio |
| **Interrogazione** | PDF singolo | — | Come Mozione |

### Estrazione testo per formato

- **PDF** → libreria di estrazione testo (es. `pdf-parse`), poi passaggio attraverso l'API Claude per riformattare in elenco puntato pulito (stesso pattern della sezione 4.4 — riuso diretto dello stesso endpoint/prompt-style)
- **DOCX** → `mammoth` per estrarre testo, poi stesso passaggio Claude per i bullet
- **RTF** → parsing più fragile (nessuna libreria robusta standard); trattarlo come "best effort": se l'estrazione fallisce, l'ODG resta vuoto e il file originale è comunque disponibile su Storage per lettura manuale — non bloccare il flusso per un formato marginale

### Individuazione del file ODG dentro lo zip (Consigli)

Euristica su nome file: pattern regex case-insensitive tipo `/ordine.?del.?giorno|^odg|o\.d\.g/i` sul nome del file dentro lo zip. Se **nessun file corrisponde** o **più file corrispondono**, non indovinare: mostrare in una schermata di revisione l'elenco dei file dello zip e chiedere a Marco di indicare a mano quale sia l'ODG (un tap, non un form). Questo evita sia falsi positivi silenziosi sia un blocco totale del flusso.

---

## 6. Automazione mail: motore di scansione schedulato

### Cambio architetturale rispetto alla prima versione di questa spec

La prima versione di questa sezione assumeva che le etichette Gmail stesse fossero la fonte di verità su "cosa è già stato importato" (pattern `-label:Importata` ereditato dal flusso Segnalazioni originale). L'uso reale ha mostrato il limite di questo approccio: in un caso (categoria Giunta), le mail sono state etichettate "Importata" **senza** che la scrittura nel tool fosse andata a buon fine — Gmail diceva "fatto", il DB diceva altro. Da qui il cambio: **il DB, non Gmail, è la fonte di verità**.

```prisma
model MailProcessata {
  id                String    @id @default(cuid())
  messageId         String    @unique
  mittente          String?
  oggetto           String?
  categoriaProposta String?
  confidenza        Float?
  binario           BinarioMail
  esito             EsitoMailProcessata  @default(IN_ATTESA)
  entitaCreataId    String?              // id della Pratica/Progetto/Atto/Contestazione/Giustifica creata, se esito COMPLETATO
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}

enum BinarioMail {
  AUTOMATICO
  MANUALE
  INCERTO
}

enum EsitoMailProcessata {
  IN_ATTESA
  COMPLETATO
  ERRORE
}
```

**Regola non negoziabile**: qualunque etichetta Gmail (di categoria o "Importata") viene scritta **solo dopo** che `esito` è stato impostato a `COMPLETATO` — cioè solo dopo conferma che la riga nel DB esiste davvero. Se la creazione fallisce, `esito` resta `ERRORE`, Gmail non viene toccato, e la riga in `MailProcessata` è il posto dove si vede cosa è rimasto indietro invece di scoprirlo per caso mesi dopo, come successo con Giunta.

### Tre binari (non più due)

**Binario automatico** (etichetta + creazione entità senza conferma preventiva, badge dopo — invariato nel perimetro già deciso):
- Consiglio Comunale (convocazione stessa, Commissioni, Interrogazioni, Mozioni)
- Giunta (Convocazioni, Verbali — Delibere/Determine restano fuori scope)
- Giustifica

**Binario a conferma manuale** (schermata di revisione prima di ogni azione, invariato):
- Segnalazioni, Deleghe → Progetto, Contestazioni

**Binario Incerto** (nuovo): quando né le regole né la classificazione AI raggiungono una soglia di confidenza sufficiente per proporre una categoria affidabile. La mail non viene forzata in una categoria sbagliata — resta con `binario: INCERTO`, etichettata in Gmail con un'etichetta dedicata ("Incerto/Da classificare", visibile anche fuori dal tool) invece di "Importata". Badge rosso dedicato in sidebar. A differenza del binario manuale (dove il sistema propone una categoria e Marco la corregge se serve), qui **non viene proposta alcuna categoria di default** — Marco sceglie da zero tra tutte quelle disponibili, perché il sistema onestamente non ha un'ipotesi affidabile da offrire.

Questa suddivisione è il punto di partenza; **da rivalutare nel tempo** se il binario automatico si dimostra affidabile anche per altre categorie oggi manuali.

### Eccezione nel binario automatico: zip del Consiglio con ODG ambiguo

Anche dentro il binario automatico c'è un caso che **non può essere automatico**: quando lo zip di una convocazione di Consiglio non permette di individuare con certezza il file dell'ordine del giorno. In quel caso specifico, il sistema si ferma e chiede conferma solo per quella mail, con la schermata che mostra l'elenco dei file dello zip per la scelta manuale — il resto del binario automatico continua a funzionare senza interruzioni per le altre mail.

### Tassonomia reale (etichette Gmail già in uso)

| Etichetta Gmail | Sotto-etichetta | Entità creata nel tool | Binario | Note |
|---|---|---|---|---|
| Segnalazioni | — (mail nuova, da importare) | `Pratica` (SEGNALAZIONE) | Manuale | Flusso esistente, invariato |
| Segnalazioni | Chiusa | *(riflette `StatoPratica.CHIUSA`)* | — | Già gestito oggi da `spostaInChiusa()` |
| Segnalazioni | In corso | *(riflette `StatoPratica.IN_CORSO`)* | — | Da estendere allo stesso pattern di "Chiusa" |
| Segnalazioni | *(altre sotto-etichette per delega)* | Campo `delega` su `Pratica`, precompilato | Manuale | Da allineare ai nomi esatti dell'enum `Delega` — vedi nota sotto |
| Consiglio Comunale | *(nessuna, mail sulla seduta stessa)* | `AttoPoliticoAmministrativo` — CONVOCAZIONE_CONSIGLIO | **Automatico** | Estrazione ODG da zip (sezione 5); eccezione se ODG ambiguo |
| Consiglio Comunale | Commissioni | `AttoPoliticoAmministrativo` — CONVOCAZIONE_COMMISSIONE | **Automatico** | Solo ODG |
| Consiglio Comunale | Interrogazioni | `AttoPoliticoAmministrativo` — INTERROGAZIONE | **Automatico** | Tentativo collegamento al Consiglio successivo |
| Consiglio Comunale | Mozioni | `AttoPoliticoAmministrativo` — MOZIONE | **Automatico** | Come Interrogazioni |
| Contestazioni | — | `Contestazione` | Manuale | Nuovo modello (sezione 3bis) |
| Deleghe | (le 10 sotto-etichette) | `Progetto`, campo `delega` precompilato | Manuale | Mappatura diretta 1:1 con l'enum `Delega`, ma la creazione del Progetto resta a conferma |
| Giunta | Convocazioni | `AttoPoliticoAmministrativo` — CONVOCAZIONE_GIUNTA | **Automatico** | Estrazione ODG |
| Giunta | Verbali | Aggiorna l'Atto della convocazione corrispondente | **Automatico** | Match per data/oggetto, stato → ARCHIVIATO |
| Giunta | Delibere, Determine | — | — | Fuori scope per ora |
| Giustifica | — | `Giustifica` | **Automatico** | Nuovo modello (sezione 3ter) |
| *(nessuna corrispondenza)* | — | — | **Incerto** | Nessuna categoria proposta, scelta manuale da zero |

### ⚠️ Nota: allineamento nomi etichette Segnalazioni-per-delega ↔ enum `Delega`

Disallineamenti già confermati durante l'implementazione della Fase 1: `RIFIUTI`/`Ciclo Rifiuti`, `SISTEMA_IDRICO`/`Idrico`, `ILLUMINAZIONE`/`Pubblica Illuminazione`, `MANUTENZIONE_PATRIMONIO`/`Lavori Pubblici`. La mappatura nome-etichetta → valore-enum va scritta una volta sola prima del parser, non scoperta bug per bug.

### Metodo di classificazione: a regole, con AI per i casi residui, Incerto come rete di sicurezza

1. **Regole primarie** su mittente/oggetto per i casi standard (etichetta Gmail già presente e affidabile, o pattern testuale chiaro)
2. **Classificazione AI (Claude)** per i casi che le regole non risolvono — la chiave Anthropic è già configurata in produzione dalla Fase 2, stesso client riusabile
3. Se anche l'AI non raggiunge una confidenza sufficiente: **Incerto**, nessuna forzatura

### Motore schedulato (non più a trigger manuale)

Cron 2 volte al giorno (orari da affinare, es. mattina presto + metà pomeriggio), stesso meccanismo Vercel Cron già usato per i Bandi ma calendario separato. Ad ogni esecuzione:

1. Interroga Gmail per i messaggi non ancora presenti in `MailProcessata` (prima esecuzione: tutto il pregresso non etichettato; esecuzioni successive: solo i nuovi arrivi)
2. Per ciascuno: classifica, determina il binario, scrive la riga in `MailProcessata` con `esito: IN_ATTESA`
3. Binario automatico → tenta la creazione dell'entità; se riesce, `esito: COMPLETATO` + etichette Gmail applicate; se fallisce, `esito: ERRORE`, nessuna etichetta, resta visibile per intervento
4. Binario manuale e Incerto → restano `IN_ATTESA` finché Marco non conferma dalla schermata di revisione (estensione di `/dashboard/import-mail`); solo alla conferma si arriva a `COMPLETATO` ed Gmail viene aggiornato

### Prima esecuzione: conferma totale, poi automatico per binario

Un flag temporaneo (es. `impostazioni.primaEsecuzioneMotoreMail: boolean`, o un semplice controllo "esistono già righe in `MailProcessata`?") forza **tutte** le mail della primissima esecuzione — incluse quelle del binario automatico — a passare dalla schermata di conferma, indipendentemente dal binario assegnato. Marco verifica che classificazione ed etichettatura siano corrette prima di disattivare il flag. Da quel momento, si torna al comportamento per binario descritto sopra: automatico resta automatico, manuale resta manuale, Incerto resta sempre a scelta manuale per definizione.

### Badge di notifica

- **🏛️ Attività Politico-Amministrativa**: badge rosso su `AttoPoliticoAmministrativo` con `visualizzato: false`
- **📝 Giustifiche**: badge rosso su `Giustifica` con `visualizzata: false`
- **Incerto**: badge rosso dedicato sul conteggio `MailProcessata` con `binario: INCERTO` e `esito: IN_ATTESA`
- Aprire la scheda di dettaglio (o risolvere la classificazione, per Incerto) azzera il badge corrispondente

---

## 7. Ordine di implementazione consigliato

La feature **Riunioni** (sezione 4) è largamente indipendente dal resto — dipende solo dai modelli `Persona` (già esistente) e `Progetto` (punto 1 sotto), quindi può essere sviluppata in parallelo o subito dopo il modello Progetto, senza aspettare il resto della pipeline di automazione mail.

1. Modello `Progetto` (schema + migrazione dati da eventuali `Pratica` tipo PROGETTO esistenti) + UI sezione dedicata (riuso diretto dei pattern già collaudati su Pratica: diario, documenti)
2. **Feature Riunioni** (sezione 4): schema (`Riunione`, `ArgomentoRiunione`) + relazione con `Persona` e `Progetto` + `db push` → componente registrazione Web Speech API (testata dal vivo su Samsung Android) → endpoint `genera-checklist` con Claude API + schermata di revisione → schermata "riunione in corso" → punti di accesso (Persona, Progetto, dashboard) → vista storico
3. Modello `Contestazione` + UI (semplice, nessuna estrazione documenti complessa) — buon primo passo per il resto della pipeline mail, volume probabilmente basso e struttura la più semplice
4. Modello `Giustifica` + checklist inoltro — stesso motivo, semplice e a basso rischio
5. Modello `AttoPoliticoAmministrativo` + `DocumentoAtto`, partendo dal caso semplice (Giunta: singolo file, no zip)
6. Estrazione ODG per PDF/DOCX + passaggio Claude per bullet list (stesso pattern già collaudato al punto 2 per le Riunioni), testata a mano su alcune convocazioni Giunta reali prima di procedere
7. Gestione zip per Consiglio (euristica ODG + schermata di revisione se ambiguo)
8. Commissioni (riusa la stessa logica di Giunta, solo ODG)
9. Mozioni/Interrogazioni + tentativo di collegamento al Consiglio successivo
10. Gestione "Giunta > Verbali" — aggancio automatico all'Atto convocazione corrispondente
11. **Binario automatico**: pipeline che etichetta + crea entità senza schermata di conferma per Consiglio Comunale (+ sottotipi), Giunta (+ sottotipi), Giustifica, con gestione dell'eccezione ODG-ambiguo-nello-zip (che resta a conferma puntuale) + badge di notifica in sidebar (`visualizzato`/`visualizzata`)
12. Pipeline di classificazione a **conferma manuale** per Segnalazioni, Deleghe→Progetto, Contestazioni — messa dopo il binario automatico perché quest'ultimo è più semplice da validare (categorie a bassa ambiguità) prima di affrontare la UI di revisione più articolata
13. Solo se necessario: fallback Whisper API per Riunioni (probabilmente non serve, dato device Android Chrome confermato)

---

## Rischi noti

- **Individuazione ODG nello zip dei Consigli**: l'euristica sul nome file può fallire se il Comune non segue una convenzione di naming costante — da qui la necessità della schermata di revisione manuale come rete di sicurezza.
- **RTF**: formato marginale e poco supportato dalle librerie Node comuni — trattato come best-effort, non bloccante.
- **Classificazione AI e generazione checklist**: piccolo costo per chiamata (frazioni di centesimo), trascurabile al volume previsto.
- **Collegamento automatico Mozione/Interrogazione → Consiglio successivo**: possibile solo se il Consiglio è già stato importato come `AttoPoliticoAmministrativo` con data nota; altrimenti il collegamento resta da fare a mano.
- **Matching Verbale → Convocazione corrispondente**: il match per data/oggetto potrebbe non essere sempre univoco. Se fallisce, meglio creare comunque la scheda con il verbale e lasciare a Marco il collegamento manuale.
- **Dipendenza dalla tassonomia Gmail esistente**: le regole di classificazione sono costruite sulla struttura di etichette attuale. Se in futuro Marco riorganizza le etichette in Gmail, le regole vanno aggiornate di conseguenza.
- **Binario automatico**: accettato un rischio di classificazione errata più basso ma non nullo, in cambio di zero attrito. Se in futuro si osservano errori ricorrenti su una di queste categorie (es. mittente/oggetto meno standardizzato del previsto), va rivalutato lo spostamento di quella specifica categoria nel binario a conferma manuale — non è una scelta definitiva e irreversibile.
- **Motore schedulato e `MailProcessata`**: questa tabella è ora l'unica fonte di verità su cosa è stato processato — se in futuro si modifica manualmente un'etichetta Gmail senza passare dal tool, il DB non se ne accorge automaticamente (e viceversa: cancellare a mano una riga in `MailProcessata` senza toccare Gmail può causare un doppio tentativo di importazione alla scansione successiva, gestito comunque in sicurezza dal vincolo `@unique` su `messageId`, ma da evitare come pratica).

### Garanzia: nessuna azione è irreversibile

Sia per il binario automatico sia per quello manuale, ogni entità creata (`Pratica`, `Progetto`, `AttoPoliticoAmministrativo`, `Contestazione`, `Giustifica`) resta **pienamente modificabile** dalla sua scheda di dettaglio dopo la creazione — tipo, delega, categoria, stato: qualunque campo, con lo stesso pattern di modifica già esistente su Pratica. Il fatto che un'entità sia stata creata dal binario automatico non la rende "bloccata" o diversa da una creata manualmente. Allo stesso modo, un'etichetta Gmail applicata per errore resta modificabile direttamente da Gmail, senza che il tool interferisca. L'unica cosa che una correzione a posteriori non fa automaticamente è "disfare" eventuali azioni derivate (es. un'estrazione ODG già avvenuta su un tipo di atto sbagliato) — quella va sistemata manualmente sul singolo record, ma non è mai una situazione irrecuperabile.
- **Web Speech API (Riunioni) non è uno standard garantito al 100%** anche su Chrome Android: dipende da versione browser e disponibilità del servizio Google in background. Va testato dal vivo prima di scartare il fallback Whisper come "non necessario".
- **Qualità della suddivisione in argomenti (Riunioni)** dipende dal prompt e da quanto la trascrizione vocale è pulita (rumore di fondo, dialetto, termini tecnici locali come toponimi di Lerici) — la schermata di revisione è pensata apposta come rete di sicurezza, non va saltata per velocizzare.
