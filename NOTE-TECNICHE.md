---
name: note-tecniche
description: "Scoperte tecniche e gotcha emersi durante sviluppo/debug — da consultare prima di rifare cose simili"
metadata:
  node_type: note
  project: lerici-assessore
  aggiornato: 2026-07-19
---

# Note tecniche — scoperte importanti

Raccolta di problemi reali incontrati e come sono stati risolti, per non riscoprirli da capo.

---

## 1. Vercel: le Environment Variables della dashboard vincono sempre sui file `.env.production` locali

Se una variabile (es. `GOOGLE_REFRESH_TOKEN`) è già registrata nelle Environment Variables del progetto su Vercel (dashboard o `vercel env add`), quel valore ha **sempre priorità** su quanto scritto nel file `.env.production` locale, anche quando si fa `vercel --prod` dalla cartella del progetto. Il file locale viene caricato da Next.js solo per le variabili che Vercel *non* ha già impostato lui stesso a livello di piattaforma.

**Conseguenza pratica**: aggiornare `.env.production` in locale e rideployare **non basta** per una variabile già presente su Vercel — bisogna aggiornarla lì:

```bash
npx vercel env rm NOME_VARIABILE production --yes
printf '%s' "$VALORE" | npx vercel env add NOME_VARIABILE production
npx vercel --prod
```

**Come verificare cosa è già registrato**: `npx vercel env ls production` — controlla la colonna "created" per capire se un valore è vecchio/stantio.

Questo ha causato un bug reale: il refresh token Google era stato rigenerato e corretto nei file locali, ma l'app in produzione continuava a fallire con `invalid_grant` perché Vercel aveva un valore di 11 giorni prima.

---

## 2. `dotenv/config` di default carica solo `.env`, mai `.env.local`

`import "dotenv/config"` (o `require("dotenv/config")`) carica **esclusivamente** il file `.env`. Next.js ha invece una sua logica di caricamento a cascata (`.env.local` > `.env.production`/`.env.development` > `.env`) che **non si applica automaticamente** agli script lanciati con `tsx`/`ts-node`.

Per script one-off che devono usare le stesse credenziali di sviluppo (`.env.local`):

```ts
import { config } from "dotenv";
config({ path: ".env.local", override: true });
```

`override: true` è necessario perché dotenv di default non sovrascrive variabili già presenti in `process.env`.

---

## 3. Supabase Storage: senza `contentType` esplicito, tutto diventa `text/plain`

`.upload(filename, buffer, { upsert: false })` **senza** l'opzione `contentType` salva l'oggetto con Content-Type `text/plain;charset=UTF-8` di default — anche se il contenuto è un PDF o un'immagine perfettamente validi. I byte restano intatti (niente corruzione), ma il browser non li apre correttamente (schermo nero nel viewer PDF).

**Fix**: passare sempre `contentType` esplicito. Helper condiviso in `lib/estrazione-documenti.ts`:

```ts
export function contentTypeDaNomeFile(nomeFile: string): string { ... }
```

usato in tutti i punti che caricano file su Storage (`app/api/atti/[id]/documenti`, `app/api/import-mail`, `lib/import-automatico.ts`, ecc.).

---

## 4. La CDN Cloudflare davanti a Supabase Storage mantiene cache per 1h anche dopo un update

Gli URL pubblici di Supabase Storage passano da Cloudflare (`cache-control: public, max-age=3600`, header `cf-cache-status: HIT`). Se si corregge un file **sullo stesso path** (via `.update()` o `.upload(..., {upsert:true})`), i client continuano a ricevere la versione vecchia dalla cache CDN per un'ora, anche subito dopo la scrittura lato origin.

**Fix affidabile**: per correggere un file già pubblicato, caricarlo su un **path nuovo** (nome file diverso) e aggiornare l'URL salvato nel DB, invece di sovrascrivere lo stesso path. Il vecchio oggetto può poi essere rimosso.

---

## 5. `pdf-parse` v2 rompe su Vercel con `DOMMatrix is not defined`

`pdf-parse` v2.x dipende da `@napi-rs/canvas` (binario nativo compilato) per alcune funzionalità di `pdfjs-dist`. In ambiente serverless Vercel questo binario nativo non si carica sempre in modo affidabile, e `pdfjs-dist` cade in un percorso di codice che richiede `DOMMatrix` — un'API del browser, inesistente in Node.js puro.

**Fix**: sceso a `pdf-parse` v1.1.4 (`npm install pdf-parse@1.1.4 -D @types/pdf-parse`) — libreria pura JS, nessuna dipendenza canvas/DOM, sufficiente perché serve solo estrazione testo (non rendering pagina). API diversa da v2:

```ts
// v1 (attuale)
const pdf = (await import("pdf-parse")).default;
const result = await pdf(buffer);
result.text

// v2 (abbandonata per questo motivo)
const { PDFParse } = await import("pdf-parse");
const parser = new PDFParse({ data: buffer });
const result = await parser.getText();
await parser.destroy();
```

---

## 6. Euristica ODG: allegati sciolti nella stessa mail vanno trattati come lo zip, non come "il documento è sempre l'ODG"

Le convocazioni di Consiglio non arrivano sempre come un unico zip: a volte la PEC ha più PDF separati come allegati diretti (es. convocazione + verbale + più mozioni nella stessa mail). Il primo codice trattava *ogni* allegato non-zip come automaticamente l'ordine del giorno — con 5 allegati, finivano tutti marcati ORDINE_GIORNO.

**Fix**: unire zip-espansi e allegati sciolti in un'unica lista di candidati, applicare la stessa euristica per nome file (`trovaOdgInZip`, funziona su qualunque lista di `{nomeFile}`) una sola volta su tutto l'insieme. Se il match non è univoco, **non indovinare**: tutto resta `PRATICA_ALLEGATA`, scelta manuale con "Estrai come ODG".

---

## 7. Etichetta "Importata" va applicata solo dopo la scrittura DB confermata

Nel binario automatico (`lib/import-automatico.ts`), `marcaImportata(messageId)` deve stare **sempre dopo** la creazione/aggiornamento DB andata a buon fine, dentro lo stesso `try`. Se un passaggio intermedio (es. estrazione ODG via Claude) può fallire, va **catturato internamente** (try/catch che non rilancia) — altrimenti l'eccezione risale, salta la `marcaImportata`, ma nel frattempo può aver già creato righe DB parziali → record orfani o mail bloccate in un limbo (né importate né riprovabili puliti).

Verifica pratica per controllare se il binario automatico ha lasciato scarti: confrontare i `messageId` con etichetta "Importata" su Gmail contro quelli effettivamente presenti nel DB.

---

## 8. Gmail: le etichette annidate sono indipendenti dal genitore

Una mail etichettata solo `Giunta/Verbali` **non** viene trovata da una query `label:Giunta` — le sotto-etichette Gmail (naming con "/") non implicano automaticamente anche l'etichetta padre. Utile saperlo quando si migrano flussi da un'etichetta flat a sotto-etichette dedicate: il codice deve puntare esplicitamente alla sotto-etichetta.

---

## 9. Match verbale → convocazione: mai "il più recente", sempre per numero di seduta

Il primo tentativo agganciava un verbale di Giunta alla convocazione "non archiviata più recente" — rischiando di archiviare la seduta sbagliata se l'ordine di elaborazione non coincideva con l'ordine cronologico reale. Fix: estrarre il numero di seduta dall'oggetto (regex `n\.?\s*(\d+)`) e cercare la convocazione con lo stesso numero; se non si trova, creare una scheda minimale separata invece di indovinare.

---

## 10. Bash tool su Windows: la working directory non è sempre quella attesa

Alcuni comandi eseguiti senza `cd` esplicito sono partiti dalla cartella padre (`C:\Users\pgwal\Cloude`) invece che dal progetto (`...\Cloude\lerici-assessore`) — ha causato un `npm install` finito nel posto sbagliato (pacchetto installato ma mai aggiunto al `package.json` del progetto) e uno script scritto in una cartella inesistente. **Prassi adottata**: prefissare sempre i comandi rilevanti con `cd /c/Users/pgwal/Cloude/lerici-assessore &&` invece di fare affidamento sulla cwd persistita tra le chiamate.

---

## 11. Zod: `.email().optional()` rifiuta la stringa vuota — serve `.or(z.literal(""))`

Un campo opzionale nel form ("" quando non compilato) fatto validare con `z.string().email().optional()` **fallisce** se il valore è `""`: `.optional()` accetta solo `undefined`, non stringa vuota, e `""` non è un'email valida. Causava un 400 silenzioso su `POST /api/persone` ogni volta che si creava un contatto senza email (comune, dato che è un campo facoltativo).

**Fix**: `.email().optional().or(z.literal(""))`, poi normalizzare `""` → `null` prima di scrivere su Prisma (pattern già usato in `PATCH /api/persone/[id]`, esteso anche al `POST`). Da applicare a qualunque campo email/url opzionale nuovo.

---

## 12. Connessione diretta Supabase (porta 5432 su `db.xxx.supabase.co`) spesso irraggiungibile — usare il session pooler per le migration

La connessione diretta (`db.xxx.supabase.co:5432`, quella in `.env`/`.env.production`) risulta irraggiungibile sia dalla sandbox agente sia, risulta, da altre reti (probabile restrizione IPv6-only lato Supabase senza l'add-on IPv4) — dà `P1001` o timeout totale. Anche il **transaction pooler** di `.env.local` (`aws-1-eu-central-1.pooler.supabase.com:6543`, `pgbouncer=true`) non va bene per le migration: pgbouncer in transaction mode non supporta i lock/prepared statement che `prisma migrate` usa.

**Fix che funziona**: usare il **session pooler**, stesso host del transaction pooler ma **porta 5432** e **senza** `?pgbouncer=true`:
```
postgresql://postgres.xuemeeudiomtvjdqbkwg:PASSWORD@aws-1-eu-central-1.pooler.supabase.com:5432/postgres
```
Con questa stringa (via `$env:DATABASE_URL`/`export DATABASE_URL=...` prima del comando, dato che `prisma.config.ts` carica solo `.env`) sia `prisma migrate deploy` che `prisma migrate status` funzionano regolarmente. `npx prisma generate` invece non richiede mai rete (legge solo lo schema).

**Nota collaterale trovata il 2026-07-19**: la migration `20260707000000_add_protocollo` risultava nel repo ma mai applicata a questo DB (drift — probabilmente la colonna era stata aggiunta a mano o con `db push` senza passare da `migrate`). Sintomo: `P3018` con `column "protocollo" ... already exists`. Risolto con `prisma migrate resolve --applied <nome_migrazione>` (operazione solo sui metadati di Prisma, non tocca lo schema reale) prima di ripetere `migrate deploy` per le migration successive.

---

## 13. Vercel Hobby: i cron possono girare al massimo 1 volta al giorno

Uno `schedule` cron in `vercel.json` che scatta più di una volta al giorno (es. `"0 6,15 * * *"`, due volte) fa fallire il deploy in produzione con `deploy_failed` — *"Hobby accounts are limited to daily cron jobs"* — anche se il resto del deploy è corretto. Il piano Hobby consente solo cron a cadenza giornaliera (o più rada, es. `"0 8 * * 1,3,5"` va bene perché al massimo 1 volta al giorno nei giorni in cui scatta).

**Conseguenza pratica**: se una spec chiede una cadenza più fitta (es. "2 volte al giorno" per il motore mail, sezione 6), va verificato il piano Vercel attivo *prima* di scrivere lo schedule — su Hobby va ridotto a 1x/giorno (o va fatto upgrade a Pro, decisione dell'utente, non da prendere in autonomia).

---

## 14. Motore mail: `NON_RILEVANTE` salta di proposito il gate "prima esecuzione" — non è un'incoerenza

`primaEsecuzione()` (`lib/motore-mail.ts`) decide se il binario Automatico può agire senza conferma, contando le righe `MailProcessata` con `esito: COMPLETATO` **e `entitaCreataId` non nullo**. Il filtro su `entitaCreataId` è voluto e va preservato se si tocca questa funzione:

- **`BinarioMail.NON_RILEVANTE`** (mail fuori scope per il tool — newsletter, bollettini, inviti) raggiunge `esito: COMPLETATO` **subito in fase di scan**, senza mai passare da `IN_ATTESA` né da una conferma umana, e senza creare nessuna entità (`entitaCreataId` resta `null`). Se questa riga contasse per il gate, la prima newsletter scansionata sbloccherebbe da sola il binario Automatico prima che Marco abbia mai confermato una vera azione — un buco di sicurezza, non un dettaglio.
- **I match forti di continuazione** (protocollo/threadId, sezione 6 evolutiva) restano invece `binario: AUTOMATICO` con `entitaCreataId` sempre valorizzato quando completano (agganciano contenuto a un'entità reale) — **rispettano** il gate come qualunque altra riga Automatico.

La differenza non è arbitraria: il gate protegge da un'azione reale sbagliata sul DB del tool (creare o modificare qualcosa prima che il meccanismo sia stato validato una volta). `NON_RILEVANTE` non fa nessuna delle due cose — è pura igiene della casella (etichetta informativa + smaltimento), non un'azione su cui serva prudenza.

**Nota collaterale verificata dal vivo il 2026-07-20**: con la soglia di confidenza generica (0.6, la stessa usata per segnalazione/progetto/contestazione) l'AI ha classificato `non_rilevante` una mail che era in realtà la chiusura di una vera segnalazione cittadina ("Mancato ritiro ingombranti", Marco stesso nel thread), confidenza 0.85. Corretto alzando una soglia dedicata `SOGLIA_NON_RILEVANTE = 0.9` in `lib/motore-mail.ts`, più alta di quella generica di proposito: qui un falso positivo sparisce subito senza controllo umano, mentre per le altre categorie un falso positivo resta comunque in Manuale a conferma — il costo di un errore non è lo stesso, la soglia non deve esserlo. Sotto soglia, la mail va a Incerto (mai a Manuale: "non_rilevante" non è una categoria selezionabile in quel form).
