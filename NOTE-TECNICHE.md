---
name: note-tecniche
description: "Scoperte tecniche e gotcha emersi durante sviluppo/debug — da consultare prima di rifare cose simili"
metadata:
  node_type: note
  project: lerici-assessore
  aggiornato: 2026-09-15
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

---

## 15. `prisma migrate dev` propone un reset: drift pre-esistente su `Bando`/`MailInviata`/`Pratica.messageId`/`StatoBando`

Scoperto il 2026-07-21 aggiungendo due colonne a `Bando`: `prisma migrate dev` rileva "drift" e minaccia `prisma migrate reset` (**cancella tutti i dati**) perché rigiocando tutte le migrazioni in `prisma/migrations/` su un DB shadow non si ottiene lo schema reale — mancano `Bando`, `StatoBando`, `MailInviata`, `Pratica.messageId`. Questi oggetti esistono davvero nel DB (funzionano, li abbiamo scritti/letti più volte in questa sessione) ma nessun file di migrazione tracciato li ha mai creati — probabilmente applicati in passato con `prisma db push` o SQL manuale, mai da una migrazione vera. `prisma migrate status` invece non se ne accorge e dice "up to date": controlla solo che le righe in `_prisma_migrations` combacino con i file, non fa il confronto strutturale profondo che fa `migrate dev`.

**Non è mai da risolvere con `prisma migrate reset`** (cancellerebbe dati di produzione veri). Per aggiungere nuove colonne/tabelle senza toccare questo drift pre-esistente: scrivere a mano il file `migration.sql` nella cartella nuova (stesso formato delle altre), applicarlo con `npx prisma db execute --file <path>` (session pooler, niente `--schema`: la config viene da `prisma.config.ts` in Prisma 7), poi `npx prisma migrate resolve --applied <nome_cartella>` per allinearlo alla cronologia — mai `prisma migrate dev` su questo DB finché il drift di fondo non viene sistemato a parte (fuori scope finché non lo chiede esplicitamente Marco, è un problema preesistente non causato da questa modifica).

---

## 16. Vercel Hobby: il tetto di durata (`maxDuration`) di una function è 300s, non 60s — non confondere con il limite di frequenza dei cron (nota #13)

Verificato via API Vercel (`GET /v2/teams`, piano confermato `hobby`) e documentazione ufficiale il 2026-07-21: con *fluid compute* (attivo di default) il piano Hobby consente **fino a 300 secondi (5 minuti)** di `maxDuration` per una function, non 60 come inizialmente assunto nel cron `check-bandi` (`app/api/cron/check-bandi/route.ts`, poi alzato a 120s per margine). Il piano Pro arriva a 800s (1800s in beta "extended").

**Non confondere due limiti diversi dello stesso piano Hobby**:
- **Frequenza dei cron** (nota #13): max 1 esecuzione al giorno — *questo* fa fallire il deploy con `deploy_failed` se violato.
- **Durata massima di una singola esecuzione** (questa nota): 300s — molto più permissivo di quanto sembri intuitivo pensando a "Hobby = piano gratuito limitato".

Prima di assumere un tetto di durata per dimensionare `maxDuration`, verificare il piano reale via `curl https://api.vercel.com/v2/teams -H "Authorization: Bearer $TOKEN"` (token in `%APPDATA%/xdg.data/com.vercel.cli/auth.json` su Windows) invece di affidarsi a un numero ricordato — i limiti Vercel cambiano nel tempo (fluid compute è una novità relativamente recente che ha alzato parecchio il tetto Hobby).

---

## 17. Rigenerare il refresh token Google in locale non lo aggiorna su Vercel — stesso principio della nota #1, direzione opposta

`scripts/get-google-token.ts` scrive il nuovo `GOOGLE_REFRESH_TOKEN` solo in `.env.local` e `.env.production` (file locali, gitignorati — mai sincronizzati con Vercel). Le Environment Variables della dashboard Vercel restano quelle vecchie finché non vengono aggiornate esplicitamente lì. Sintomo osservato il 2026-07-26: token scaduto (`invalid_grant`), rigenerato correttamente in locale (verificato funzionante da script), ma il caricamento mail in produzione continuava a fallire — `npx vercel env ls production` mostrava il vecchio token, creato 7 giorni prima.

**Fix**: dopo aver rigenerato il token con lo script, aggiornarlo anche su Vercel:
```bash
npx vercel env rm GOOGLE_REFRESH_TOKEN production --yes
sed -n 's/^GOOGLE_REFRESH_TOKEN="\(.*\)"$/\1/p' .env.local | npx vercel env add GOOGLE_REFRESH_TOKEN production
npx vercel --prod --yes
```
Un cambio di env var su Vercel richiede comunque un nuovo deploy per essere effettivo sulle function già in esecuzione.

---

## 18. Estrazione allegati mail: due bug distinti, stessa causa di fondo (liste di tipi mai tenute sincronizzate)

Scoperti il 2026-07-26 mentre si indagava perché alcuni Progetti/Atti creati da mail non avessero mai ricevuto i loro allegati:

- **Mail non-PEC senza estrazione allegati**: `parseMessaggioPerId` (`lib/gmail.ts`) estraeva gli allegati solo dentro il ramo `postacertPart` (mail PEC con `postacert.eml`). Per qualunque mail Gmail normale (non certificata) il ramo `else` leggeva solo il corpo testo e non guardava mai gli allegati — nessun filtro sui tipi, proprio nessuna lettura. Fix: stessa estrazione aggiunta anche lì, individuando i veri allegati tra le parti MIME (`filename` non vuoto + `body.attachmentId`, a differenza delle parti di corpo inline che hanno `filename` vuoto).
- **Filtro tipi più stretto dello storage**: la lista `TIPI_ALLEGATO_AMMESSI` (usata per decidere quali allegati estrarre) accettava solo `image/*` e `application/pdf` — escludendo Word/RTF/ZIP che `contentTypeDaNomeFile` (`lib/estrazione-documenti.ts`) sapeva già gestire correttamente per lo storage. Un `.doc` (`application/msword`) dentro una PEC non veniva mai caricato.

**Lezione**: quando esistono due liste separate che descrivono "che tipi di file sono supportati" (una per l'estrazione, una per il content-type di storage), va tenuta una sola fonte di verità o le due vanno controllate insieme ad ogni modifica — altrimenti si crea un buco silenzioso (nessun errore, l'allegato semplicemente non arriva mai).

---

## 19. Cambiare l'algoritmo di deduplica (hash) senza backfill lascia duplicati storici, anche se il nuovo codice è corretto

Scoperto il 2026-07-26: il commit `78d4199` (21/07) ha cambiato la chiave di hash dei Bandi da titolo (estratto via AI, variabile run su run) a `bandoUrl` (stabile) — fix corretto e verificato: zero duplicati creati dopo quel commit. Ma i bandi già in DB da *prima* del fix avevano hash calcolati con l'algoritmo vecchio; ogni scan successivo ricalcolava un hash diverso (nuovo algoritmo) per lo stesso bando reale, non trovava corrispondenza (`findUnique` sul vecchio hash falliva) e ne creava un altro — 20 gruppi di duplicati accumulati tra il 10/07 e il 22/07, ciascuno con una notifica Telegram separata.

**Lezione**: cambiare la chiave/l'algoritmo di una deduplica esistente richiede quasi sempre un backfill esplicito sui record già in DB (ricalcolare l'hash col nuovo algoritmo sui record esistenti), non solo il codice nuovo per i record futuri — altrimenti il vecchio e il nuovo continuano a divergere silenziosamente finché qualcuno non se ne accorge dai duplicati visibili in UI.

**Attenzione se si pulisce manualmente**: prima di eliminare i duplicati, verificare se una delle copie ha uno stato che riflette una decisione umana già presa (es. `SCARTATO`/`INTERESSANTE` su Bando) — va riportato sul record superstite, mai perso scegliendo la copia da tenere solo per data.

---

## 20. `npx vercel --prod` può fallire con un falso errore sulla Root Directory, anche a impostazione corretta sul server — bug della CLI, non della config

Scoperto il 2026-08-09: `npx vercel --prod --yes` falliva con `Error: If defined, the Root Directory must be a relative path not starting with './'...`, ripetuto identico anche dopo aver verificato via API (`GET /v9/projects/...`) che `rootDirectory` sul progetto era correttamente `null`, dopo aver aggiornato la CLI a `@latest`, e dopo un rilink completo (`.vercel` cancellata, `vercel link` da zero). La causa più probabile: un bug della CLI stessa nel calcolo del percorso relativo quando la cartella di lavoro coincide esattamente con la root del progetto (comportamento cambiato di recente — Vercel ha toccato la logica di matching root-directory/link nella CLI proprio ad agosto 2026), non qualcosa di sbagliato nella configurazione del progetto.

**Fix/bypass**: il progetto è collegato a GitHub — non serve affatto `vercel --prod` da locale. Due alternative che aggirano completamente la CLI:
- Dashboard Vercel → Deployments → "..." sull'ultimo deployment → **Redeploy**.
- `git commit --allow-empty -m "trigger redeploy" && git push origin master` (l'integrazione GitHub builda da sola).

Le environment variable già aggiornate (es. `GOOGLE_REFRESH_TOKEN`) vengono comunque applicate al nuovo build in entrambi i casi — sono lette al momento del deploy, non passate dalla CLI. **Evitare `vercel --prod` da locale finché questo bug non risulta risolto a monte.**

---

## 21. Il refresh token Google scade ogni ~7 giorni: non è normale usura, è lo stato "Testing" dell'OAuth consent screen

Scoperto il 2026-08-09, dopo l'ennesima rigenerazione del token (vedi nota #17): Google **forza la scadenza di ogni refresh token dopo 7 giorni esatti** quando lo stato di pubblicazione ("Publishing status") dell'app OAuth su Google Cloud Console è **"Testing"** — indipendentemente da quanto o quanto spesso l'app viene usata. Non è un sintomo di bug nel nostro codice né di una config di refresh sbagliata: è una regola documentata di Google per le app non pubblicate.

**Fix**: Google Cloud Console → il progetto usato per questo tool → APIs & Services → OAuth consent screen → **Publish App**. Con stato "In production" il refresh token non ha più il tetto fisso di 7 giorni — resta valido finché non viene revocato manualmente, non usato per 6 mesi, o la password Google cambia.

**Attenzione**: un token già emesso *mentre* lo stato era ancora "Testing" può restare comunque soggetto al tetto dei 7 giorni originario anche dopo il Publish successivo — il Publish non è retroattivo sui token già in circolazione. Dopo aver pubblicato l'app, rigenerare il token **un'ultima volta** con `scripts/get-google-token.ts` e sincronizzarlo su Vercel (nota #17), così il token in uso è quello emesso *dopo* la pubblicazione.

**Effetto collaterale del Publish, non un blocco**: alla prossima autorizzazione manuale comparirà lo schermo "Google non ha verificato questa app" (l'app richiede `gmail.modify`, scope sensibile, e non è passata dalla verifica ufficiale di Google) — cliccare "Avanzate" → "Vai a [nome app] (non sicuro)" per procedere. Irrilevante per un tool a uso personale; la verifica ufficiale serve solo per app con molti utenti esterni.

---

## 22. Il pattern `config({path:".env.local"})` della nota #2 non basta più con `import { prisma } from "../lib/prisma"` statico: serve `import()` dinamico

Scoperto il 2026-09-14 sistemando `scripts/list-bandi.ts`: seguendo esattamente il pattern della nota #2 (`import { config } from "dotenv"; config({ path: ".env.local", override: true }); import { prisma } from "../lib/prisma";`) lo script falliva con `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` — non l'errore di rete `P1001` della nota #12, un errore diverso e più subdolo.

Causa: `lib/prisma.ts` chiama `new Pool({ connectionString: process.env.DATABASE_URL })` **a livello di modulo** (non dentro una funzione lazy). Con gli script eseguiti da `tsx` in questo progetto, le dichiarazioni `import` statiche vengono issate (hoisted) ed eseguite **prima** di qualunque altra istruzione del file, indipendentemente dall'ordine testuale — quindi `import { prisma } from "../lib/prisma"` valutava `process.env.DATABASE_URL` (e costruiva il `Pool` con quel valore, catturato una volta sola) **prima** che la `config()` scritta sulla riga precedente venisse davvero eseguita. Verificato con un log subito prima e subito dopo l'import: `process.env.DATABASE_URL` risultava già corretto (`.env.local`, pooler) in entrambi i punti — perché il log è codice normale, non un import, e quindi *non* viene issato — ma il `Pool` dentro `lib/prisma.ts` aveva comunque già catturato il valore sbagliato (probabilmente `undefined`, dato che nulla aveva ancora caricato `.env` a quel punto) al momento della sua creazione.

**Fix**: sostituire l'import statico di `lib/prisma` con un `import()` dinamico dentro `main()`, che a differenza di `import` statico **non** viene issato e quindi viene eseguito solo al punto in cui compare nel codice, dopo la `config()`:
```ts
import { config } from "dotenv";
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../lib/prisma");
  // ...
}
```

**Script già scritti col vecchio pattern (import statico) probabilmente affetti dallo stesso bug, non ancora verificati/corretti**: `scripts/test-motore-mail.ts`, `scripts/test-motore-mail-esecuzione.ts`. Da controllare/correggere allo stesso modo se rieseguiti e falliscono con lo stesso errore SASL.

---

## 23. Gmail tratta i nomi etichetta come case-insensitive per l'unicità — `getOrCreateLabel` no

Scoperto il 2026-09-15 implementando `Segnalazioni/<Delega>` (Fase 2 sezione 3): creando le sotto-etichette per delega, `Segnalazioni/Lavori Pubblici` falliva con `GaxiosError 409 "Label name exists or conflicts"`. Il motivo: esisteva già `Segnalazioni/lavori pubblici` (minuscolo, residuo di un'organizzazione manuale precedente al tool), e Gmail considera i due nomi la stessa etichetta ai fini dell'unicità — ma `getOrCreateLabel()` (`lib/gmail.ts`) confrontava i nomi con `===` (case-sensitive), quindi non la trovava nella lista e provava a crearne una "nuova" che Gmail rifiutava come duplicato.

**Fix**: confronto case-insensitive (`.toLowerCase()` su entrambi i lati) nella ricerca, più un retry sul 409 residuo (ri-cerca invece di far fallire il chiamante, per una race o una variante di maiuscole sfuggita alla prima lista).

**Conseguenza pratica per rinominare un'etichetta esistente invece di crearne una nuova**: se due nomi differiscono solo per maiuscole/minuscole, `gmail.users.labels.create()` fallirà sempre con 409 — l'unico modo per ottenere il casing voluto è `gmail.users.labels.update({ id, requestBody: { name } })` sull'etichetta già esistente (stesso id, non un oggetto nuovo). Tentare "crea la nuova, sposta i messaggi, elimina la vecchia" per una differenza di solo casing fallisce anche sullo spostamento messaggi (`gmail.users.messages.modify` con lo stesso id sia in `addLabelIds` che `removeLabelIds` → 400 "Cannot both add and remove the same label", perché `getOrCreateLabel` corretto ritorna lo stesso id per entrambi i nomi).

**Nota collaterale**: la casella Gmail di Marco aveva già una tassonomia `Segnalazioni/*` ad-hoc precedente al tool (etichette per argomento tipo `Sfalci`, `ingombranti`, `scarichi`, oltre a `Rifiuti` con nome diverso dalla delega `Ciclo Rifiuti`) — riorganizzata a mano (con script una tantum, non nel codice dell'app) in sotto-etichette annidate sotto la delega corretta (es. `Segnalazioni/Ambiente/Sfalci`, `Segnalazioni/Ciclo Rifiuti/Ingombranti`). Se emergono altre etichette "orfane" sotto `Segnalazioni/` non riconducibili a una delega, chiedere a Marco come nidificarle piuttosto che indovinare.

---

## 24. Riconciliazione Gmail→tool (Fase 2 sezione 4): mai fidarsi della "prima etichetta trovata" — le etichette residue pre-cleanup esistono davvero

Scoperto il 2026-09-15 con un dry-run in sola lettura prima di eseguire dal vivo `riconciliaEtichette()` (che scrive su Pratica/Progetto): un Progetto reale, creato il 2026-07-19 (prima del fix su `daRimuovere` diagnosticato il 2026-07-25), portava ancora l'etichetta Gmail `Deleghe/Lavori Pubblici` **insieme** alla vera etichetta corrente `Istituzioni/ANCI` — residuo mai ripulito perché la logica di pulizia etichette in conflitto non esisteva ancora quando quel Progetto fu classificato. Un design che prende "la prima etichetta Deleghe/Istituzioni/Segnalazioni trovata sul messaggio" per dedurre lo stato corrente avrebbe sovrascritto silenziosamente un'entità già classificata correttamente, usando un'etichetta spazzatura di 2 mesi prima.

**Fix**: quando un messaggio porta contemporaneamente etichette di più di un albero che dovrebbero essere mutuamente esclusivi (es. sia `Deleghe/*` che `Istituzioni/*` sullo stesso Progetto — un Progetto ha o una vera delega o un ente, mai entrambi — o più deleghe distinte sotto `Segnalazioni/*`), va trattato come **conflitto per revisione manuale**, mai risolto indovinando quale delle due sia quella giusta.

**Lezione generale**: qualunque funzione che deriva lo stato "vero" leggendo le etichette Gmail attuali di un messaggio già processato in passato deve considerare che **le etichette vecchie non vengono sempre ripulite** (bug già corretti non sono retroattivi sui dati già scritti prima del fix) — mai assumere che l'insieme delle etichette presenti sia internamente coerente. Verificare con un dry-run in sola lettura contro i dati reali prima di eseguire qualunque funzione di riconciliazione/backfill che scrive sul DB.

**Nota collaterale — quota Gmail API**: lo stesso dry-run (una chiamata `gmail.users.messages.get(format:"full")` per riga, senza throttling, su ~30 righe consecutive) ha esaurito la quota "Units per minute per user" dell'API Gmail (`GaxiosError 403 rateLimitExceeded`). Il `maxRighe` di default di `riconciliaEtichette()` è stato abbassato da 50 (proposta originale spec) a 20, per restare più lontano dal limite dato che questa funzione gira nello stesso ciclo cron che ha già fatto scan + esecuzione automatica (stesso budget di quota condiviso). Nessun problema a recuperare in più giri: la spec conferma esplicitamente che questa riconciliazione non deve essere near-realtime.

---

## 25. `ANTHROPIC_API_KEY` non era mai stata configurata su Vercel produzione — ogni chiamata Claude falliva silenziosamente da almeno agosto 2026

Scoperto il 2026-09-15 indagando perché una mail con oggetto chiarissimo ("Rifiuti abbandonati in Via Figarole e mancato ritiri continui.") fosse finita in Incerto invece che proposta come Segnalazioni/Ciclo Rifiuti. Query sul DB: **tutte le 216 righe `IN_ATTESA` con binario `INCERTO`** avevano `categoriaProposta` e `confidenza` **entrambi `null`** — non "confidenza sotto soglia" (quello lascerebbe comunque una categoria proposta), proprio nessuna risposta valida mai arrivata da Claude, per nessuna delle 216 mail, distribuite su agosto (97) e settembre (119) senza soluzione di continuità.

`classificaMail()` (`lib/claude.ts`) testato in isolamento con `.env.local`: risposta corretta e immediata (`{"categoria":"segnalazione","confidenza":0.95}` sullo stesso identico testo). La chiave quindi funzionava — ma solo in locale. `npx vercel env ls production` ha confermato: **`ANTHROPIC_API_KEY` non compariva affatto** tra le environment variable di produzione (mai aggiunta, a differenza di tutte le altre chiavi/secret già presenti). `getClient()` in `lib/claude.ts` lancia `Error("ANTHROPIC_API_KEY non configurata")` se manca — eccezione che risale fino a `classificaESalva()` (`lib/motore-mail.ts`), dove un try/catch la inghiotte di proposito ("un errore qui non deve mai bloccare lo scan — degrada a Incerto") **senza loggare nulla**: da fuori, l'assenza totale della chiave è indistinguibile da una classificazione genuinamente incerta.

**Impatto**: non solo `classificaMail` — **tutte** le funzioni in `lib/claude.ts` condividono lo stesso `getClient()` e quindi lo stesso fallimento in produzione: `classificaZona` (sezione 1, appena introdotta — mai realmente testata in produzione fino ad ora), `classificaTipoProgetto` (suggerimento Progetto/Attività), `riformattaOdg` (pulizia ordini del giorno), `generaChecklist` (nota vocale riunioni → checklist). Tutte silenziosamente degradate al fallback "nessun suggerimento" da mesi.

**Fix**: `cat <chiave> | npx vercel env add ANTHROPIC_API_KEY production`, poi redeploy (commit vuoto + push, non `vercel --prod` da locale — vedi nota #20) per applicarla. Stesso pattern esatto delle note #1 e #17 (env var presente in locale ma mai sincronizzata su Vercel) — **terza occorrenza dello stesso tipo di bug** con chiavi/secret diverse: controllare `npx vercel env ls production` è ormai il primo sospetto quando qualcosa "sembra non funzionare mai" in produzione ma va bene in locale, prima di cercare altrove.

**Da fare ancora**: le 216 righe già finite in Incerto con categoria/confidenza null non vengono ri-scansionate automaticamente (`scansionaMail()` salta per sempre i messaggi già in `MailProcessata`) — restano bloccate finché non vengono confermate a mano da Marco, o finché non si scrive uno script mirato che richiama `classificaMail()` su queste righe specifiche e aggiorna `categoriaProposta`/`confidenza`/`etichettaProposta` senza toccare `esito`/`entitaCreataId`.

---

## 26. `trovaOCreaEnteVario` cercava per nome esatto: "REGIONE" e "Regione" diventavano due enti

Scoperto il 2026-09-21. Il binario Automatico chiamava `eseguiProgettoVarie(m, "REGIONE")` (chiave della categoria, maiuscola) mentre l'ente seed si chiama "Regione": l'upsert per nome esatto creava un secondo ente "REGIONE", con Progetti spezzati tra i due (19 + 4) e nomi diversi tra DB e etichetta Gmail `Istituzioni/Regione` (`NOME_ENTE_FISSO`). Stesso rischio latente per "GOVERNO". **Fix**: ricerca case-insensitive (`findFirst` con `mode: "insensitive"`, poi create) in `lib/enti-vari.ts`; doppione unito a mano. Vale come per le etichette Gmail (#23): i nomi vanno sempre confrontati senza distinzione di maiuscole.
