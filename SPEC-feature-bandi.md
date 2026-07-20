---
name: spec-feature-bandi
description: "Specifica tecnica per l'implementazione della sezione Bandi in lerici-assessore — monitoraggio bandi pubblici con notifica Telegram"
metadata:
  node_type: spec
  type: feature
  project: lerici-assessore
  created: 2026-07-10
---

# Feature: Monitoraggio Bandi Pubblici

## Obiettivo

Nuova sezione **Bandi** nella dashboard (posizionata dopo **Rubrica** nella sidebar), che aggrega automaticamente i bandi pubblici rilevanti per le deleghe di Marco (nazionale/regionale/provinciale), con notifica Telegram ai nuovi risultati. Il controllo gira **lunedì, mercoledì, venerdì**.

**Approccio estrazione:** scraping strutturato senza LLM (no costi per chiamata). Limite noto: meno robusto ai cambi di layout dei siti sorgente rispetto a un'estrazione con LLM — va previsto un meccanismo di alert se un parser smette di produrre risultati (probabile cambio HTML sorgente, non assenza di bandi).

---

## 1. Fonti da monitorare

| Fonte | URL | Livello | Scrapabilità | Note parsing |
|---|---|---|---|---|
| Conferenza Stato-Città e Autonomie Locali | `conferenzastatocitta.gov.it/home/notizie-e-comunicati/[anno]/` | Nazionale | **Alta** — sito Presidenza Consiglio dei Ministri, HTML pulito, filtro "Bandi Europei" già separato dalle notizie generiche, nessun blocco riscontrato | **Priorità 1**: massima affidabilità istituzionale, contenuti scritti esplicitamente per Comuni/Province, zero rumore imprese |
| x-desk — Info Bandi | `x-desk.it/infobandi/` | Nazionale/multi-regionale | **Alta** — tabella strutturata pulita (titolo, area tematica, link diretto alla fonte ufficiale, descrizione, scadenza, importo), filtrabile per tipologia (Contributi Nazionali/Regionali, Fondi Strutturali, PNRR) e area tematica, nessun blocco/paywall riscontrato | **Priorità 1**: ogni voce vista è per enti locali (mai solo-imprese), e il campo "Riferimenti" linka alla pagina ufficiale del bando invece che al loro sito — ottimo per popolare `bandoUrl`. **Stesso limite di UPEL**: aggrega multi-regione (visto Lombardia, Veneto, FVG), quindi il parser deve verificare l'ambito territoriale prima di salvare, scartando bandi espliciti per altre regioni non liguri (i bandi nazionali/PNRR restano sempre validi) |
| ANCI Liguria — Bandi | `anciliguria.it/bandi` | Regionale (filtrato per enti locali) | **Alta** — già filtrato su Comuni/enti, include PNRR | **Priorità 1**: fonte più "pulita" perché esclude bandi solo-imprese, nessun blocco robots riscontrato |
| UPEL — Bandi e finanziamenti per enti locali | `upel.va.it/it/bandi-e-finanziamenti-per-enti-locali` | Nazionale/multi-regionale | **Alta** — HTML pulito, card categorizzate in 6 aree tematiche (Amministrazione, Attività produttive, Cultura, Digitale, Tecnica/Ambiente, Welfare), nessun blocco riscontrato in fetch di prova | **Priorità 1**: già filtrata su enti locali (niente rumore imprese). **Attenzione**: aggrega bandi di varie regioni italiane (molti Lombardia/Emilia-Romagna) — il parser deve aprire la pagina di dettaglio di ogni bando e verificare l'ambito territoriale (nazionale o Liguria) prima di salvarlo, scartando quelli espliciti per altre regioni |
| Filse — Bandi On Line | `filse.it` | Regionale (execution layer) | **Media** — annunci in home ma le domande vere passano su piattaforma separata `bandi.filse.it` | Usare solo per notizie apertura/chiusura finestre, non per submission — da verificare robots.txt prima di implementare |
| Comune della Spezia — Bandi e Finanziamenti | `comune.laspezia.it/.../bandi-e-finanziamenti` | Provinciale/locale | **Bassa** — HTML poco strutturato, aggiornamenti sporadici | Parser tollerante, verificare manualmente ogni tanto |
| ANCI nazionale | `anci.it` (sezione bandi/finanziamenti) | Nazionale | **Media** | Già filtrato per enti locali, come ANCI Liguria — da verificare struttura esatta in fase di implementazione |
| Italia Domani — Bandi Amministrazioni Titolari | `italiadomani.gov.it/it/opportunita/bandi-amministrazioni-titolari.html` | Nazionale | **Media/Bassa** | Aggregatore reale di bandi PNRR dei vari ministeri, spesso con enti locali tra i beneficiari. **Attenzione: il sito ha bot-detection**, quindi il fetch va testato con uno user-agent realistico; se blocca comunque, prevedere controllo manuale periodico invece di un parser automatico |
| PA Digitale 2026 | `padigitale2026.gov.it` | Nazionale | **Media** | Solo bandi digitalizzazione — includere solo se rilevante per una delega di Marco (innovazione/digitale), altrimenti skip |
| PAefficace — Bandi PA | `paefficace.it/bandi-pa.php` | Nazionale/regionale | **Media** | Azienda commerciale (Formel s.r.l.), ma l'anteprima categorizzata (Bandi Europei/Nazionali/Regionali/Contributi e Finanziamenti/Avvisi Pubblici) è pubblicamente visibile senza blocco. L'archivio completo è probabilmente dietro abbonamento. **Attenzione copyright**: contenuti editoriali di terzi — usare solo per il link/titolo/scadenza, mai ripubblicare le descrizioni testuali |

### ⚠️ Fonti bloccate da robots.txt: declassate a controllo manuale

`regione.liguria.it/homepage-sviluppo-economico/.../category/3:contributi.html` era la fonte prevista come priorità 1 nella prima versione della spec (struttura a card molto pulita, ottima per lo scraping). **Verifica robots.txt (luglio 2026): il dominio `regione.liguria.it` vieta esplicitamente l'accesso a tutti i bot** (`User-agent: * / Disallow: /`, con `Crawl-delay: 600`), consentendo solo i crawler nominati dei grandi motori di ricerca (Googlebot, Bingbot, ecc.) — non un bot personalizzato.

Verificato anche il portale open data collegato (`dati.regione.liguria.it`, sistema CKAN con API proprie): esiste ma contiene solo dataset storici/di rendicontazione (es. elenco bandi PSR 2014-2020, beneficiari FEP), non un feed live dei bandi attualmente aperti — non è un'alternativa utilizzabile per questo scopo.

**`incentivi.gov.it`** (portale ufficiale MIMIT, citato anche da BandiPA come fonte "bandi nazionali per enti pubblici") ha lo **stesso problema**: robots.txt disallow rilevato in fase di verifica.

**Decisione:** entrambe queste fonti restano fuori dalla pipeline automatica di scraping, per rispetto della policy esplicita dei siti. Vanno trattate come **controllo manuale periodico** (Marco/collaboratore le consulta a occhio, magari nello stesso giro lun/mer/ven), oppure si valuta in futuro un contatto diretto con gli enti per un accesso dati concordato, se il volume di bandi rilevanti lo giustifica.

**Fonti valutate e scartate (non aggiunte alla pipeline):**
- **OpenCoesione** — portale di monitoraggio dati su progetti già finanziati, non un listing di bandi aperti da candidare
- **Politiche di Coesione (politichecoesione.governo.it)** — i bandi qui sono quasi tutti rivolti alle Autorità di Gestione regionali (le Regioni stesse), non ai Comuni direttamente: è un livello "a monte" già intercettato via Regione Liguria/Filse
- **Invitalia** — quasi esclusivamente rivolto a imprese, non enti locali
- **Gazzetta Ufficiale** — troppo generalista/rumorosa come fonte diretta
- **Ministero Interno (istanzedigitali.mit.gov.it)** — è il portale dove *si presenta* la domanda, non dove si annuncia il bando; l'apertura viene comunque rilanciata da ANCI, quindi non serve un parser dedicato
- **ContributiEuropa.com** — servizio commerciale a pagamento: i risultati filtrati sono dietro login/piano a pagamento ("hai raggiunto il limite giornaliero di ricerche per il piano free"), non sostenibile come fonte automatica. Può servire solo per una verifica manuale occasionale
- **BandiPA** — prodotto SaaS con verifica idoneità via AI, ma la lista bandi vera è dietro registrazione/login. Utile solo come conferma indiretta che `incentivi.gov.it` e un "portale EU Funding" sono fonti nazionali reali
- **Obiettivo Europa** — servizio commerciale (TradeLab S.p.A.): pubblicamente leggibile senza login immediato, ma anche nel filtro "bandi regionali/locali" la maggioranza dei risultati sono per CCIAA/imprese, non per enti. Richiederebbe un doppio filtro aggiuntivo per isolare i soli bandi "Enti pubblici/Enti territoriali" — rimandato, priorità bassa rispetto alle fonti già pulite trovate

**Nota:** partire con **Conferenza Stato-Città, x-desk Info Bandi, ANCI Liguria e UPEL** in produzione — sono le più affidabili, già filtrate per enti locali, e nessuna blocca l'accesso automatico. Aggiungere ANCI nazionale, Italia Domani e PAefficace solo dopo aver validato il pattern parser+dedup+notifica, dato che la loro scrapabilità/sostenibilità è meno certa. Regione Liguria e Incentivi.gov.it restano monitorate manualmente finché non si trova un'alternativa (accesso dati concordato, feed RSS non ancora individuato, ecc.).

---

## 2. Schema dati (Prisma)

Aggiungere a `prisma/schema.prisma`:

```prisma
model Bando {
  id              String       @id @default(cuid())
  titolo          String
  ente            String       // "Regione Liguria", "ANCI Liguria", "Comune della Spezia", ecc.
  fonteUrl        String       // URL pagina di origine (listing)
  bandoUrl        String?      // URL specifico del bando, se disponibile
  descrizione     String?
  dotazione       String?      // testo libero, es. "9,8 milioni di euro" (spesso non è un numero pulito in origine)
  beneficiari     String?      // testo libero, es. "Comuni < 40.000 abitanti, Province"
  dataApertura    DateTime?
  dataChiusura    DateTime?
  delega          Delega?      // se riconducibile a una delega esistente (nullable: potrebbe essere trasversale)
  hashContenuto   String       @unique // hash di titolo+fonteUrl+dataChiusura per deduplica
  stato           StatoBando   @default(NUOVO)
  notificato      Boolean      @default(false)
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
}

enum StatoBando {
  NUOVO
  VALUTATO      // Marco l'ha guardato
  INTERESSANTE  // segnato per approfondire / candidare
  SCARTATO
  SCADUTO
}
```

Riusa l'enum `Delega` già esistente nel modello `Pratica` per coerenza (mappatura bando→delega sarà solo un tentativo euristico via keyword, non garantita — lasciare sempre modificabile manualmente da UI).

---

## 3. Pipeline di scraping

### Struttura file

```
lib/bandi/
  fonti/
    conferenza-stato-citta.ts  — parser dedicato (priorità 1)
    xdesk-infobandi.ts          — parser dedicato + verifica ambito territoriale (priorità 1)
    anci-liguria.ts              — parser dedicato (priorità 1)
    upel.ts                      — parser dedicato + verifica ambito territoriale (priorità 1)
    filse.ts
    comune-laspezia.ts
  index.ts                 — orchestratore: chiama tutti i parser, normalizza risultati
  dedup.ts                 — calcolo hash + confronto con DB
  notifica.ts              — invio Telegram
```

Nota: `regione-liguria.ts` e `incentivi-gov.ts` non sono nella lista — quelle fonti non vanno scrapate (vedi sezione 1, robots.txt le vieta).

Ogni parser in `fonti/` espone la stessa interfaccia:

```typescript
interface BandoRaw {
  titolo: string;
  ente: string;
  fonteUrl: string;
  bandoUrl?: string;
  descrizione?: string;
  dotazione?: string;
  beneficiari?: string;
  dataApertura?: Date;
  dataChiusura?: Date;
}

async function parseFonte(): Promise<BandoRaw[]>
```

Uso di `cheerio` per il parsing HTML (già leggero, coerente con l'uso di `mailparser`/`iconv-lite` già presente nel progetto per altri parsing).

### Deduplica

Hash SHA256 di `titolo.trim().toLowerCase() + fonteUrl + (dataChiusura?.toISOString() ?? '')`. Se l'hash esiste già in DB → skip (non è un nuovo bando, anche se il testo attorno è leggermente cambiato per un refresh di pagina).

### Job trigger

Vercel Cron (`vercel.json`):

```json
{
  "crons": [
    { "path": "/api/cron/check-bandi", "schedule": "0 8 * * 1,3,5" }
  ]
}
```
(08:00 UTC = 09:00/10:00 ora italiana a seconda di ora legale — verificare in fase di deploy, eventualmente aggiustare a `0 7 * * 1,3,5` per uscire alle 9:00 CET fisse in inverno).

Endpoint `app/api/cron/check-bandi/route.ts`:
1. Esegue tutti i parser in `lib/bandi/fonti/`
2. Per ciascun risultato: calcola hash, verifica se già presente
3. Se nuovo: salva in DB con `stato: NUOVO`, `notificato: false`
4. A fine giro: prende tutti i `Bando` con `notificato: false`, li invia via Telegram, marca `notificato: true`
5. Log errori per fonte (se un parser ritorna 0 risultati per 2 esecuzioni consecutive → possibile rottura selettori, da segnalare)

**Proteggere l'endpoint cron** con header secret (`CRON_SECRET` env var, verificato lato route) per evitare trigger esterni non autorizzati — pattern standard Vercel Cron.

---

## 4. Notifica Telegram

Riutilizzare il bot Telegram già esistente (creato per altri progetti). Per attivarlo su questo progetto:

1. Recuperare il **token del bot** già creato (da BotFather — cercare nella chat con @BotFather la lista `/mybots` se non salvato altrove)
2. Recuperare/confermare il **chat_id** di Marco (se il bot è già usato altrove probabilmente è già noto; altrimenti: scrivere un messaggio al bot e leggere l'update via `https://api.telegram.org/bot<TOKEN>/getUpdates`)
3. Aggiungere env var su Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
4. Invio messaggio via HTTPS diretto (no SDK necessario, un fetch basta):

```typescript
async function inviaNotificaTelegram(bandi: Bando[]) {
  const testo = bandi.map(b =>
    `📋 *${b.titolo}*\n${b.ente}${b.dataChiusura ? `\n⏰ Scadenza: ${formatData(b.dataChiusura)}` : ''}${b.dotazione ? `\n💰 ${b.dotazione}` : ''}\n${b.bandoUrl ?? b.fonteUrl}`
  ).join('\n\n');

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: testo,
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
    }),
  });
}
```

Se in un'esecuzione ci sono più di ~5 bandi nuovi, valutare di raggrupparli in un unico messaggio riassuntivo invece di uno per bando (evitare flood).

---

## 5. UI — Dashboard

### Sidebar

Aggiungere voce **📢 Bandi** subito dopo **Rubrica**, con badge contatore dei bandi in stato `NUOVO`.

### Pagina `/dashboard/bandi`

- Lista bandi, filtro per stato (Nuovo / Valutato / Interessante / Scartato / Scaduto) e per delega
- Ordinamento default: prima i `NUOVO`, poi per `dataChiusura` crescente (scadenze più vicine in alto)
- Card bando: titolo, ente, dotazione, beneficiari, data chiusura evidenziata se entro 15 giorni, link al bando
- Azioni rapide sulla card: cambia stato (Valutato/Interessante/Scartato), assegna/correggi delega
- Bandi con `dataChiusura` passata → spostati automaticamente in `SCADUTO` (job separato o check lazy on-read)

---

## 6. Ordine di implementazione consigliato

1. Schema Prisma (`Bando`, `StatoBando`) + `db push`
2. Parser per Conferenza Stato-Città (fonte più affidabile, già filtrata su enti locali) + endpoint cron minimale che salva in DB senza notificare ancora
3. Verifica manuale: i dati estratti sono sensati? aggiustare selettori
4. Aggiungere notifica Telegram
5. Aggiungere parser x-desk Info Bandi (incluso il controllo ambito territoriale sulla pagina di dettaglio) e ANCI Liguria
6. Aggiungere parser UPEL (incluso lo stesso controllo ambito territoriale)
7. UI sezione Bandi in dashboard
8. Solo dopo, valutare se aggiungere le fonti a scrapabilità più incerta (ANCI nazionale, Italia Domani, PAefficace) o impostare un promemoria per il controllo manuale di Regione Liguria e Incentivi.gov.it

---

## Rischi noti

- **Robustezza scraping**: qualsiasi redesign dei siti sorgente rompe silenziosamente il parser. Serve un modo per accorgersene (es. notifica Telegram separata "⚠️ nessun risultato da [fonte] da 2 esecuzioni" invece di fallire silenziosamente come già accade per gli errori Gmail nel flusso di chiusura pratica — qui però va segnalato, non ignorato, perché altrimenti non arrivano più bandi senza che nessuno se ne accorga).
- **Mappatura automatica delega**: sarà solo euristica (keyword matching su titolo/descrizione), non affidabile al 100% — lasciare sempre modificabile da UI.
- **Riuso contenuti di terzi**: alcune fonti (PAefficace, e in generale i portali privati) pubblicano descrizioni editoriali proprie, non testo ufficiale del bando. Il campo `descrizione` va tenuto breve/riassuntivo e il link (`bandoUrl`) deve puntare, quando possibile, alla pagina ufficiale dell'ente che ha emesso il bando — non alla pagina dell'aggregatore — per non dipendere da (né riprodurre estesamente) contenuti editoriali altrui. x-desk fa già questo bene: il campo "Riferimenti" linka alla fonte ufficiale.
