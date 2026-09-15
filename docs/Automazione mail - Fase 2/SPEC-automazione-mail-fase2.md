---
name: spec-automazione-mail-fase2
description: "Fase 2 dell'automazione mail: estrazione zona/mittente per Segnalazioni, sotto-etichette Segnalazioni/Delega, riconciliazione Gmail->tool per etichette spostate a mano, enti istituzionali e gestori come modelli dati, nuovo TipoAtto Bilancio, indagine Contestazioni-vs-Progetti"
metadata:
  node_type: spec
  type: feature
  project: lerici-assessore
  created: 2026-09-15
  extends: spec-riorganizzazione-riunioni-automazione-mail
---

# Automazione mail — Fase 2

## Perché questa fase

La Fase 1 (vedi `SPEC-riorganizzazione-riunioni-automazione-mail.md`) ha costruito l'architettura giusta: DB come unica fonte di verità, etichetta Gmail scritta solo dopo che l'entità è confermata nel DB, tre binari (Automatico/Manuale/Incerto), motore schedulato. Questa fase non cambia quell'architettura — aggiunge sei pezzi mancanti o incompleti, individuati leggendo il codice reale (`lib/motore-mail.ts`, `lib/classificatore.ts`, `lib/constants.ts`, `lib/gmail.ts`, `lib/continuazione.ts`, `app/api/motore-mail/**`), non ipotizzati:

1. Estrazione zona (luogo) per Segnalazioni — oggi assente
2. Estrazione vero mittente per mail non-PEC inoltrate da un capo settore per conto di un cittadino — oggi assente
3. Sotto-etichetta Gmail `Segnalazioni/<Delega>` — oggi Segnalazioni è piatta
4. Riconciliazione: un'etichetta Gmail spostata a mano su una mail già processata deve aggiornare il tool — oggi non succede mai
5. Enti istituzionali (Regione, Provincia, ANCI, Governo...) — oggi solo 3 domini hardcoded e un enum chiuso
6. Gestori (ACAM Ambiente, ACAM Acque, ATC, Enel, Maris) — oggi un enum chiuso senza Maris, e nessuna etichetta per la mail che arriva DA loro
7. Bilancio — oggi non riconosciuto, nessun TipoAtto dedicato
8. Contestazioni che finiscono sotto Progetti — indagine da fare, non ancora una soluzione

Ogni sezione è indipendente dalle altre e può essere implementata (e testata) da sola.

---

## 1. Estrazione zona (luogo) per Segnalazioni

### Stato attuale

`estraiLuogo()` esiste in `lib/classificatore.ts` (regex su pattern tipo "via/piazza/frazione + parola") ma non è importata da nessuna parte della pipeline mail. In `app/dashboard/import-mail/page.tsx` riga 165, il campo `luogo` del form parte sempre da stringa vuota — zero suggerimento, Marco lo scrive sempre a mano.

### Perché non riusare semplicemente `estraiLuogo()`

Una regex generica su "via/piazza/frazione" produce falsi positivi frequenti (coglie "via" come preposizione, non solo come inizio toponimo) e non sa distinguere un vero nome di via di Lerici da una frase qualunque. Lo stesso principio già applicato altrove in questo progetto ("un'incertezza visibile è meglio di una falsa certezza") vale anche qui: meglio nessun suggerimento che uno sbagliato con aria di essere affidabile.

### Soluzione proposta

Chiamata Claude Haiku (stesso pattern di `classificaMail`/`classificaDelega` già in produzione), **ancorata a un elenco chiuso di vie/frazioni di Lerici**, non a generazione libera:

```typescript
// lib/classificatore.ts o nuovo lib/zona.ts
const PROMPT_ZONA = (testo: string, vieNote: string[]) => `Sei un assistente che individua la zona/via citata in una segnalazione di un cittadino al Comune di Lerici.
Elenco delle vie/frazioni note del Comune di Lerici:
${vieNote.join(", ")}

Se il testo cita chiaramente una di queste vie/frazioni (anche con piccole varianti di scrittura), rispondi con il nome esatto dall'elenco.
Se il testo cita una via/zona che NON è nell'elenco ma è comunque un riferimento geografico chiaro e specifico (es. un numero civico, un incrocio, un luogo noto), riportalo così com'è scritto nel testo.
Se non c'è nessun riferimento di zona utilizzabile, rispondi con null.
Rispondi SOLO con un oggetto JSON: {"zona": "..." | null}

Testo: "${testo}"`;
```

**INPUT NECESSARIO da Marco**: l'elenco vie/frazioni di Lerici da usare come ancoraggio. Senza questo elenco il grounding non ha senso — o si parte con un elenco parziale (le vie più citate nelle segnalazioni storiche) e lo si amplia nel tempo.

**Raccolto il 2026-09-15** (Google Maps ha bloccato la ricerca con un captcha anti-bot; usate fonti alternative):

Frazioni ufficiali (Wikipedia — Comune di Lerici): La Serra, Muggiano, Pozzuolo, Pugliola, San Terenzo, Senato, Tellaro.

Località minori (stessa fonte): Bagnola, Barcola, Falconara, Fiascherino, Le Figarole, Maralunga, Monti-San Lorenzo, Pianelloni, Tre Strade, Venere Azzurra, Solaro, Rocchetta, Zanego.

Elenco vie (query Overpass API su OpenStreetMap, dati stradali del Comune di Lerici — **non ancora verificato a campione, estratto da un modello di sintesi automatico su un JSON grezzo**, va controllato prima di usarlo come ancoraggio definitivo): Via Oronte Petriccioli, Via della Repubblica, Via Nino Gerini, Via Militare, Via Giuseppe Mazzini, Via Meneghetti, Viale della Vittoria, Via Giacomo Matteotti, Via Bagnara, Via Paolo Mantegazza, Via Cavour, Via Sebastiano Biaggini, Via Della Pace, Via Fiascherino (+ traverse I-V), Via Carpanini, Via San Giuseppe, Via Amerigo Vespucci, Via Fornara, Via Barcola, Via Carro, Via Casini, Via Vecchia, Via al Parco della Rimembranza, Via San Bernardino, Via Angelo Bacigalupi, Via Trogu, Via della Chiesa, Via Sante Gattoronchieri, Via Pozzuolo, Via Debbio, Via Gazzoli, Via dei Pianelloni, Via Gozzano (+ 1a Traversa), Via Delle Casette, Via Maggiola, Via Tre Strade, Via Giuseppe Garibaldi, Viale Spinola, Via Venti Settembre, Via Giulio Vassale, Via Biaggini (+ 1a/2a Traversa), Via Carbognano (1a/2a/3a Traversa), Via Giacopello Ambrogio, Via San Giorgio, Via Andrea Doria, Via Carlo Pisacane, Via General Ferrari, Via del Fiume, Via Lizzo, Via Fratelli Landi, Via Canarbino, Via Tagliata, Via Vittorio Alfieri, Via Milano, Via Venticinque Aprile, Via Gramsci, Via Pelosini, Via 24 Maggio, Via G. Byron, Via Carpaneta, Via Mazzini, Via Tra Il Campanile, Via XX Settembre, Via Narbostro, Via E. Ferro, Via Enrico Fermi, Via L. Giannoni, Via L. Barbieri, Via F. Poggi, Via O. Turini, Via del Campo, Via Lawrence, Via Dante, Via Ezio Pontremoli, Via San Francesco d'Assisi, Via XXVIII Settembre, Via Paolo Azzarini, Via Generale Bonaventura Zanelli, Via Sotto il Volto, Via Don Minzoni, Via George Byron, Via San Giuseppe 1a Traversa; Piazza/Piazzetta/Largo: Piazza Giuseppe Garibaldi, Piazza Figoli, Piazza IV Novembre, Piazza Angelo Bacigalupi, Piazza Mottino, Piazza Valtriani, Piazza Cesare Battisti, Piazzetta Francesco Tarabotto, Largo Sardegna, Largo Guglielmo Marconi; altre denominazioni: Lungomare Vassallo, Rotonda/Rotatoria Vassallo e Primacina, Galleria Scoglietti/Pugliola/Primacina/Pietra Fuligna/Muggiano/Padula, Salita Severino Zanelli/Revellino/al Poggio/Falconara/A. Canata/al Castello, Vicolo Cortese, Scalinata Shelley/Marchesa Odile Botti Poggi, Passeggiata don Attilio Castiglione, Panoramica della Rocchetta; località interne citate come toponimo: Guercio (e Guercio Colomba, Guercio prima traversa), Santa Teresa, Bagnara, Catene, Figarole, Colombiera, Redarca, Monti San Lorenzo, Monti Branzi, Martino, Pianelloni, Narbostro, Codina, San Carlo, Valle, Rombà, Bozzo Del Lino, Zanego.

Nota di coerenza: le frazioni ufficiali (La Serra, Muggiano, Pozzuolo, Pugliola, San Terenzo, Senato, Tellaro) sono probabilmente il livello di ancoraggio più utile per le Segnalazioni — i cittadini tendono a citare la frazione/zona più del nome esatto della via. L'elenco via-per-via è più ampio ma anche più rumoroso (numerose varianti "1a/2a/3a Traversa" della stessa via) e da verificare prima di darlo in pasto al prompt.

Wiring: la funzione va chiamata dove oggi si calcola `delegaSuggerita` (in `app/api/motore-mail/revisione/route.ts`), aggiungendo un campo `zonaSuggerita` alla risposta, e in `dashboard/import-mail/page.tsx` il campo `luogo` si inizializza da quello invece che da `""`. Resta editabile, mai vincolante — stessa logica già in uso per `delegaSuggerita`.

Costo: stesso ordine di grandezza delle altre chiamate Haiku già in produzione (frazioni di centesimo a chiamata).

---

## 2. Vero mittente per mail non-PEC inoltrate

### Stato attuale

Per le PEC (`postacert.eml`), `lib/gmail.ts` righe 82-85 già estrae correttamente "Mittente:" e "Mail mittente:" dalla busta di certificazione, distinguendoli dall'header From. Funziona bene, non toccare.

Per una mail Gmail normale (non PEC) in cui un capo settore inoltra il messaggio di un cittadino, non c'è nessuna estrazione: `nomeMittente`/`emailMittente` restano quelli dell'header From, cioè il capo settore che ha inoltrato, non il cittadino originale.

### Soluzione proposta

Quando **non** c'è `postacert.eml` (ramo `else` di `parseMessaggioPerId`, righe 150-169 di `gmail.ts`) e il corpo contiene un pattern tipico di inoltro (`Da:`, `From:`, `----- Messaggio inoltrato -----`, `---------- Forwarded message ---------`), estrarre con una regex mirata il blocco intestazione dell'email inoltrata e usarne il mittente al posto di quello dell'header. Stesso principio già in uso per la PEC, esteso al caso Gmail-nativo:

```typescript
const PATTERN_INOLTRO = /(?:-{3,}\s*(?:messaggio inoltrato|forwarded message)\s*-{3,}|^Da:|^From:)/im;
```

Se il pattern non matcha, nessun cambiamento — resta l'header From come oggi. Se matcha ma l'estrazione del nome/email fallisce, stesso trattamento: nessun default silenzioso, resta l'header From con la certezza di partenza.

Questo è un miglioramento incrementale, non un caso da risolvere al 100%: i formati di inoltro variano (client mail diversi citano l'intestazione in modi leggermente diversi), quindi va trattato come un tentativo best-effort, mai come garanzia.

---

## 3. Sotto-etichetta Gmail `Segnalazioni/<Delega>`

### Stato attuale

`etichettaPerCategoria("segnalazione")` in `lib/constants.ts` (riga 386) ritorna sempre e solo `"Segnalazioni"`, a prescindere dalla delega scelta. Le uniche sotto-etichette esistenti sotto Segnalazioni sono di STATO (`Chiusa`, `In corso`), non di delega.

### Decisione presa

Aggiungere `Segnalazioni/<Delega>` come sotto-etichetta di classificazione, in coesistenza con le sotto-etichette di stato — un messaggio può avere contemporaneamente `Segnalazioni/Viabilità` e, più avanti nel tempo, `Segnalazioni/Chiusa` (Gmail supporta più etichette sullo stesso messaggio senza conflitto).

### Modifica

```typescript
// lib/constants.ts
export function etichettaPerCategoria(categoria: string, delega?: Delega, categoriaVaria?: CategoriaVaria): string | null {
  if (categoria === "segnalazione") {
    return delega ? `Segnalazioni/${DELEGHE_LABEL[delega]}` : "Segnalazioni";
  }
  // ... resto invariato
}
```

Da verificare in fase di implementazione: le etichette Gmail nidificate usano già lo stesso nome delega (`DELEGHE_LABEL`) usato da `Deleghe/<nome>` — coerente, una sola tabella nomi da mantenere, non una seconda mappatura parallela.

Impatto su `spostaInChiusa()` (`lib/gmail.ts`): oggi rimuove l'etichetta `Segnalazioni` piatta. Va aggiornata per rimuovere `Segnalazioni/<Delega>` (qualunque essa sia sul messaggio), non la stringa fissa `"Segnalazioni"`.

---

## 4. Riconciliazione: Gmail → tool quando l'etichetta cambia a mano

### Stato attuale

`scansionaMail()` (`lib/motore-mail.ts` riga 290) salta ogni messaggio già presente in `MailProcessata` — per sempre. Se Marco sposta a mano una mail già processata in un'altra sotto-etichetta Gmail (es. da `Segnalazioni/Viabilità` a `Segnalazioni/Ambiente`), il tool non se ne accorge mai: `Pratica.delega` resta quella originale.

### Vincolo da rispettare

La regola "DB prima di Gmail, mai il contrario" nasce da un incidente reale (Giunta etichettata senza che la scrittura DB fosse riuscita) e resta valida per **creazione/cancellazione di entità**. La riconciliazione qui proposta non la viola: non crea né cancella mai un'entità, aggiorna solo campi di classificazione (delega, categoria Varia, eventualmente stato) su un'entità che esiste già.

### Soluzione proposta

Nuovo passaggio, stesso cron, dopo lo scan dei nuovi arrivi:

```typescript
// lib/motore-mail.ts — nuova funzione
export async function riconciliaEtichette(maxRighe = 50): Promise<{ aggiornate: number; conflitti: string[] }> {
  const righeCompletate = await prisma.mailProcessata.findMany({
    where: { esito: "COMPLETATO", entitaCreataId: { not: null }, categoriaProposta: { in: ["segnalazione", "progetto"] } },
    orderBy: { updatedAt: "asc" },
    take: maxRighe,
  });

  const mappaEtichette = await getMappaEtichette();
  let aggiornate = 0;
  const conflitti: string[] = [];

  for (const riga of righeCompletate) {
    const mail = await getMailPerId(riga.messageId);
    if (!mail) continue; // mail cancellata/spostata altrove — non blocca il resto del giro

    const nomiEtichetteAttuali = mail.labelIds.map(id => mappaEtichette.get(id)).filter((n): n is string => !!n);

    // Confronta l'etichetta attuale su Gmail con quella registrata l'ultima volta.
    const etichettaAttuale = nomiEtichetteAttuali.find(e => e.startsWith("Segnalazioni/") || e.startsWith("Deleghe/") || e.startsWith("Varie/"));
    if (!etichettaAttuale || etichettaAttuale === riga.etichettaProposta) continue; // nessun cambio

    // Deriva la nuova delega/categoria dall'etichetta e aggiorna SOLO quel campo sull'entità già esistente.
    // ... risoluzione etichetta -> delega/categoriaVaria (riusa ETICHETTA_DELEGA già esistente)
    // ... update Pratica.delega o Progetto.delega/categoriaVaria
    // ... update riga.etichettaProposta per non ri-processare lo stesso cambio al giro successivo

    aggiornate++;
  }

  return { aggiornate, conflitti };
}
```

Punti da decidere in fase di implementazione, non banali:
- **Frequenza**: stesso cron dello scan (2 volte al giorno) è sufficiente per lo scopo — non serve near-realtime, confermato da Marco (polling ogni 3-5 minuti accettabile per lo scan; per la riconciliazione anche più raro va bene, il caso d'uso è "ho corretto un'etichetta e voglio che il tool si allinei entro la giornata", non "subito").
- **Cosa succede se l'etichetta non è riconosciuta** (es. Marco ha creato un'etichetta a mano senza passare dal tool): non forzare nulla, loggare come "conflitto" per revisione manuale — stesso principio del binario Incerto.
- **Non tocca mai `MailProcessata.esito` né `entitaCreataId`**: quei campi restano quelli della creazione originale, la riconciliazione è un canale a parte.

---

## 5. Enti istituzionali (Regione, Provincia, ANCI, Governo...) — da enum a modello

### Stato attuale

`categoriaVariaPerDominio()` in `lib/classificatore.ts` riconosce solo `@anci.it`, `regione.liguria.it`, `*.gov.it`. `CategoriaVaria` in `schema.prisma` è un **enum** (`COMUNICAZIONI | ANCI | REGIONE | GOVERNO`) — aggiungere Provincia oggi richiede una migration.

Nota di coerenza interna: la spec originale motiva esplicitamente `CategoriaSegnalazione` come modello (non enum) "perché un enum richiede una migrazione ogni volta che se ne aggiunge uno" — lo stesso ragionamento vale qui e non era stato applicato.

### Soluzione proposta

```prisma
model EnteVario {
  id       String  @id @default(cuid())
  nome     String  @unique   // "Regione Liguria", "Provincia della Spezia", "ANCI", "Prefettura"...
  dominio  String? @unique   // "regione.liguria.it" — nullable per enti senza un dominio affidabile (es. Comunicazioni generiche)
  progetti Progetto[]
}
```

`Progetto.categoriaVaria` (enum) diventa `Progetto.enteVarioId` (FK opzionale) — stessa relazione già usata per `CategoriaSegnalazione` su `Pratica`. Migration dati: le righe esistenti con `categoriaVaria` valorizzato vanno convertite in righe `EnteVario` corrispondenti + FK popolata.

**Decisione di Marco (2026-09-15)**: non serve un elenco enti completo raccolto a monte. Il seed iniziale resta minimo (Regione Liguria, unico dominio già in uso oggi) — il punto del modello `EnteVario` è proprio poter **aggiungere un ente al volo**, senza migration, quando arriva una mail da un ente/associazione del territorio non ancora conosciuto dal tool.

**Conseguenza sul design**: non basta la tabella `EnteVario` da sola — serve un punto di UI dove Marco può creare un nuovo `EnteVario` (nome + dominio/indirizzo mittente) nel momento in cui classifica una mail arrivata da un ente non riconosciuto, così che la mail successiva dallo stesso mittente venga già riconosciuta automaticamente. Stesso principio già in uso per `delegaSuggerita` nel form di conferma (`app/dashboard/import-mail/page.tsx`): suggerimento/scelta a mano lì dove oggi si conferma la categoria, non un modulo di amministrazione separato. Punto aperto da decidere in fase di implementazione: se il campo "nuovo ente" nel form crea `EnteVario` subito o solo dopo un secondo utilizzo dello stesso mittente (per evitare di popolare la tabella con mittenti "una tantum" che non si ripeteranno mai).

**Nota 2026-09-15 — Ato Rifiuti spostato in sezione 6**: Marco ha chiesto la sotto-etichetta `Gestori/Ato Rifiuti` (non `Varie/Ato Rifiuti`) — questo ente va quindi trattato come `Gestore` (modello di sezione 6.1, FK su `Contestazione`), non come `EnteVario`. Indirizzi noti restano validi per il riconoscimento dominio/mittente, solo il modello dati cambia. Vedi sezione 6 per il dettaglio.

**Raccolto il 2026-09-15 — indirizzi reali degli enti istituzionali** (via ricerca web, da verificare a campione prima di seed):
- **Regione Liguria**: `protocollo@pec.regione.liguria.it` — conferma il dominio già hardcoded (`regione.liguria.it`)
- **Provincia della Spezia**: `protocollo.provincia.laspezia@legalmail.it` (protocollo generale); esistono anche caselle di ufficio specifiche sullo stesso dominio (es. `tutelaambiente.provincia.laspezia@legalmail.it`) — stesso principio di ACAM: dominio `legalmail.it` condiviso con altri enti (ATC, Ato Rifiuti), matching per indirizzo esatto o per prefisso locale noto (`*.provincia.laspezia@legalmail.it`), non per dominio nudo
- **ANCI nazionale**: `anci@pec.anci.it` (PEC), `info@anci.it` (non-PEC); dipendenti che scrivono da indirizzi personali sul dominio `anci.it` (visto in mail reali): `calabrese@anci.it`, `giovannini@anci.it`, `cicchiello@anci.it` — questi **sì** matchano un controllo per dominio nudo `anci.it` (a differenza della PEC `pec.anci.it` e di ANCI Liguria `pec.it`, che non lo matchano)
- **ANCI Liguria**: `anciliguria@pec.it` (PEC — dominio generico `pec.it`, **non** matcha il controllo attuale su `@anci.it`), `info@anciliguria.eu`, `noreply@anciliguria.eu` (non-PEC)
- **Prefettura della Spezia** (Governo/UTG): `protocollo.prefsp@pec.interno.it`, `comunicazione.cittadinanza.prefsp@pec.interno.it` (PEC), `prefettura.laspezia@interno.it` (non-PEC)
- **Governo/Ministeri** (segnalato da Marco): `pnrr@postacert.istruzione.it` — comunicazioni PNRR del Ministero dell'Istruzione

**Raccolto il 2026-09-15 — forze dell'ordine e soccorso, da aggiungere subito come `EnteVario` (richiesta esplicita di Marco, non solo esempio)**:
- **Questura della Spezia**: `gab.quest.sp@pecps.poliziadistato.it` (PEC gabinetto), `dipps177.00f0@pecps.poliziadistato.it` (informazioni)
- **Prefettura della Spezia**: già raccolta sopra — `protocollo.prefsp@pec.interno.it`, `comunicazione.cittadinanza.prefsp@pec.interno.it`, `prefettura.laspezia@interno.it`
- **Carabinieri — Stazione di Lerici**: `tsp25829@pec.carabinieri.it`
- **Carabinieri — Stazione di Sarzana**: `tsp25711@pec.carabinieri.it`
- **Carabinieri — Comando Provinciale La Spezia**: `tsp22304@pec.carabinieri.it`
- **Carabinieri — Stazione La Spezia P.le**: `tsp24770@pec.carabinieri.it`
- **Vigili del Fuoco — Comando di La Spezia**: `com.laspezia@cert.vigilfuoco.it` (sede), `com.salaop.laspezia@cert.vigilfuoco.it` (sala operativa), `com.prev.laspezia@cert.vigilfuoco.it` (ufficio prevenzione incendi)

Nota: tutti i Carabinieri condividono il dominio `pec.carabinieri.it` (come già visto per `legalmail.it`/`pec.it`) — matching per indirizzo locale esatto, non per dominio. Stesso discorso per i tre indirizzi Vigili del Fuoco su `cert.vigilfuoco.it`.

**Attenzione — l'assunzione `*.gov.it` nel codice attuale (`categoriaVariaPerDominio`) non copre questi indirizzi reali**: nessuno dei domini sopra (`pec.regione.liguria.it`, `legalmail.it`, `pec.anci.it`, `pec.it`, `pec.interno.it`, `postacert.istruzione.it`) termina in `.gov.it` — è il dominio del sito istituzionale (es. `interno.gov.it`) a usare quel TLD, non necessariamente il dominio della casella PEC/mail usata per comunicare. Il riconoscimento va quindi costruito su un elenco esplicito di domini/indirizzi noti per ente, esattamente come per i Gestori (sezione 6), non su un pattern di TLD.

Etichetta Gmail: resta `Varie/<nome ente>`, `getOrCreateLabel()` (già esistente, generico) la crea al volo se manca — nessuna modifica lato Gmail necessaria, solo lato classificazione/dati.

---

## 6. Gestori (ACAM Ambiente, ACAM Acque, ATC, Enel, Maris) — da enum a modello + etichetta per l'entrata

### Stato attuale

`Gestore` (`schema.prisma`) è un enum: `ACAM_AMBIENTE | ACAM_ACQUE | ATC | ENEL` — Maris non c'è. `classificaGestore()` (`lib/classificatore.ts` riga 102) suggerisce un gestore nel form di conferma delle Contestazioni (`gestoreSuggerito`, usato in `dashboard/import-mail/page.tsx` riga 164) ma **ha un default silenzioso**: se nessuna regex combacia, ritorna comunque `ACAM_AMBIENTE` invece di `null` — unico punto della codebase dove questo principio (mai un default silenzioso) non è rispettato.

Oggi non esiste nessuna etichetta/classificazione per la mail che arriva IN ENTRATA da questi gestori quando non è risposta a una Contestazione già tracciata (il matching per protocollo/threadId in `lib/continuazione.ts` copre solo le risposte in thread esistenti) — cade nella classificazione AI generica a 4 categorie, che non ha una casella adatta e tipicamente la manda su "progetto".

### Soluzione proposta

**6.1 — Da enum a modello**, stesso pattern del punto 5:

```prisma
model Gestore {
  id       String  @id @default(cuid())
  nome     String  @unique   // "ACAM Ambiente", "ACAM Acque", "ATC Esercizio", "Enel", "Maris"
  dominio  String? @unique   // per il riconoscimento automatico della mail in entrata
  contestazioni Contestazione[]
}
```

`Contestazione.gestore` (enum) → `Contestazione.gestoreId` (FK). `classificaGestore()` corretta per ritornare `null` quando nessuna regola combacia (mai più un default silenzioso) — il campo resta vuoto nel form finché Marco non lo sceglie, coerente col principio già in uso ovunque nel resto del codice.

**Nomi etichetta confermati da Marco (2026-09-15)** — sotto-etichette specifiche, non un `<nome>` generico da derivare: `Gestori/Acam Ambiente`, `Gestori/Acam Acque`, `Gestori/Maris`, `Gestori/Enel`, `Gestori/ATC esercizio`, `Gestori/Ato Rifiuti`.

Nota: Ato Rifiuti (Ambito Territoriale Ottimale rifiuti, Provincia della Spezia) era stato inserito in sezione 5 come `EnteVario` — Marco lo vuole invece nell'albero `Gestori/`, insieme ad ACAM/ATC/Enel/Maris. Decisione presa da Marco, non da ipotesi tecnica: va rispettata, ma implica che il modello dati per Ato Rifiuti sia lo stesso `Gestore` (FK, sezione 6.1), non `EnteVario` — da correggere nella sezione 5, che oggi lo elenca ancora come esempio di ente. Se in futuro emergono altri enti "borderline" (né gestore di utenza né ente istituzionale puro, es. consorzi), chiedere sempre a Marco piuttosto che dedurre dalla natura giuridica dell'ente.

**6.2 — Nuovo albero Gmail `Gestori/<nome>`** per la mail in entrata che non è una risposta a una contestazione già tracciata:

- Riconoscimento per dominio mittente (stesso meccanismo di `categoriaVariaPerDominio`), da costruire con i domini reali di questi gestori (**INPUT NECESSARIO**: i domini email di ACAM Ambiente, ACAM Acque, ATC Esercizio, Enel, Maris)

**Raccolto il 2026-09-15**:
- ACAM Ambiente: `acamambiente@pec.gruppoiren.it`, `ccambiente@pec.gruppoiren.it` (PEC); più 3 dipendenti IREN che scrivono da indirizzi aziendali non-PEC per conto di ACAM Ambiente: `Marco.Salatino@gruppoiren.it`, `Diego.Quarantiello@gruppoiren.it`, `Simone.Merlo@gruppoiren.it`
- ACAM Acque: `acamacque@pec.gruppoiren.it`
- ATC Esercizio: `atceserciziospa@legalmail.it`
- Enel (e-distribuzione): `e-distribuzione@pec.e-distribuzione.it`
- Maris: `coopmaris@pec.it`

**Attenzione — il riconoscimento non può essere per suffisso di dominio**: `pec.gruppoiren.it` è condiviso da ACAM Ambiente e ACAM Acque (mittenti diversi, stesso dominio); `gruppoiren.it` (senza `pec.`) è il dominio aziendale generico di IREN, usato anche dai 3 dipendenti sopra — non identifica da solo "ACAM Ambiente" più di quanto identifichi un qualunque altro settore IREN; `legalmail.it` e `pec.it` sono provider PEC generici (come Aruba/Poste), condivisi con altri enti (es. ATO Rifiuti su `legalmail.it`, sezione 5). Il matching va fatto sull'**indirizzo mittente esatto** (elenco chiuso di indirizzi noti per gestore), non sul dominio — coerente col principio "mai un default silenzioso" già applicato altrove in questa spec: un dominio sconosciuto o ambiguo non deve indovinare un gestore.
- Prima di instradare come "nuova comunicazione", controllare comunque (come già oggi) se il messaggio è una risposta a una Contestazione esistente (protocollo/threadId) — se sì resta nel flusso Contestazioni esistente, invariato
- Se non è una risposta e il mittente è riconosciuto: **sempre** una nuova entità leggera nel tool (decisione di Marco, 2026-09-15 — vedi sotto), mai solo l'etichetta Gmail

**Decisione di Marco (2026-09-15)**: sì, sempre un'entità nel tool — nessuna mail deve avere solo l'etichetta Gmail senza corrispondenza nel DB. Principio generale, non solo per questa sezione: vale per Gestori (6.2), per gli enti istituzionali/forze dell'ordine (sezione 5) e per qualunque categoria futura. Dove oggi manca una corrispondenza (es. mail "Gestori/<nome>" che oggi cadrebbe solo come etichetta), va creata un'entità leggera — stessa logica già in uso per Contestazioni/Progetti, non un canale a parte "solo etichetta".

---

## 7. Bilancio — nuovo TipoAtto

### Stato attuale

`classificaDup()` riconosce solo "DUP"/"documento unico di programmazione". Bilancio (previsione, rendiconto, variazioni) non ha nessun riconoscimento — cade nella classificazione AI generica.

### Soluzione proposta

Stesso trattamento di DUP, volumi bassi confermati da Marco ("ce ne saranno poche"):

```prisma
enum TipoAtto {
  // ... esistenti
  BILANCIO
}
```

```typescript
// lib/classificatore.ts
const REGEX_BILANCIO = /\bbilancio\s+di\s+previsione\b|\bbilancio\s+di\s+esercizio\b|\brendiconto\s+di\s+gestione\b|\bvariazione\s+di\s+bilancio\b/i;

export function classificaBilancio(oggetto: string): boolean {
  return REGEX_BILANCIO.test(oggetto);
}
```

Binario **Manuale** (non Automatico), stesso ragionamento già applicato a DUP: segnale testuale pulito ma campione troppo piccolo per fidarsi ciecamente. Etichetta `Giunta/Bilancio` (accanto a `Giunta/Dup`, stesso livello). Estrazione testo: come DUP, nessuna riformattazione Claude — un documento di bilancio è già strutturato di suo.

---

## 8. Contestazioni che finiscono sotto Progetti — indagine, non ancora soluzione

Marco non sa se è un problema di classificazione (arriva nella sua casella ma viene instradata male) o di visibilità (scambi di altri dipendenti comunali col gestore, che il tool non vede mai). Prima di scrivere codice, verificare con dati reali:

1. Contare quanti `Progetto` con `categoriaVaria: COMUNICAZIONI` (o senza vera delega) hanno nel `titolo`/nei documenti allegati un riferimento a uno dei gestori (ACAM, ATC, Enel, Maris) — se ce ne sono, è un problema di classificazione: quella mail arrivava nella casella di Marco ma la regola/AI non la riconosceva come pertinente a un gestore
2. Se il numero è basso o nullo, il sospetto si sposta sulla visibilità: chiedere a Marco se le contestazioni "vere" vengono scritte da lui (nella casella tracciata) o da altri uffici comunali in copia/diretto — in quel caso nessuna modifica di classificazione risolve nulla, serve una fonte diversa (es. Marco in CC sistematico, o una casella condivisa da collegare)

Il punto 6.2 (nuovo dominio-matching per i gestori) probabilmente risolve da solo una parte dei casi di classificazione — vale la pena implementare prima il punto 6 e poi rifare il conteggio del punto 1, invece di indagare e correggere due volte.

---

## 9. Giustifiche — verifica, non modifica

Il modello `Giustifica` e `eseguiGiustifica()` risultano corretti leggendo il codice: creazione entità, upload allegati, binario Automatico legato all'etichetta Gmail "Giustifica". Nessun bug individuato. Prima di toccare qualunque cosa qui: verificare a mano su 2-3 giustifiche reali recenti che tutto il percorso (mail → entità → checklist inoltro) funzioni come atteso. Se emerge un sintomo specifico, va trattato come un bug isolato, non come parte di questa fase.

---

## Ordine di implementazione consigliato

1. **Sezione 6.1** (Gestori: enum → modello, aggiunta Maris, fix default silenzioso di `classificaGestore`) — piccolo, autonomo, corregge un bug reale (default silenzioso)
2. **Sezione 5** (Enti: enum → modello) — stesso pattern, stesso tipo di migration, ha senso farle insieme
3. **Sezione 7** (Bilancio) — piccolo, isolato, stesso pattern già collaudato per DUP
4. **Sezione 3** (Segnalazioni/Delega in Gmail) — piccolo, tocca `etichettaPerCategoria` e `spostaInChiusa`
5. **Sezione 1** (estrazione zona) — richiede l'elenco vie/frazioni da Marco prima di partire
6. **Sezione 2** (vero mittente non-PEC) — indipendente, quando c'è tempo
7. **Sezione 6.2** (etichetta Gestori per l'entrata) — dipende dai domini reali (input necessario) e dalla decisione su entità-o-solo-etichetta
8. **Sezione 8** (indagine Contestazioni/Progetti) — dopo il punto 7, per non indagare su dati che il punto 7 cambierà
9. **Sezione 4** (riconciliazione Gmail→tool) — la più delicata architetturalmente, va per ultima e testata a parte, con volumi bassi all'inizio (`maxRighe` piccolo)
10. **Sezione 9** (verifica Giustifiche) — indipendente, può avvenire in qualunque momento, anche subito

## Input necessari da Marco prima di iniziare

- ~~Elenco vie/frazioni di Lerici (sezione 1)~~ — **raccolto il 2026-09-15**: frazioni ufficiali + località da Wikipedia, elenco vie da OpenStreetMap (da verificare a campione). Marco vuole entrambi i livelli (via **e** frazione) come ancoraggio, non solo la frazione.
- ~~Elenco enti istituzionali con domini email (sezione 5)~~ — **chiuso il 2026-09-15**: Marco ha chiarito che non serve un elenco completo raccolto a monte. Seed minimo: solo Regione Liguria (`protocollo@pec.regione.liguria.it`, già confermato, unico dominio già in uso oggi). Il sistema va progettato per estendere gli enti/associazioni del territorio al volo, dal form di conferma mail, non da un elenco precompilato — vedi sezione 5 per il design. Gli altri indirizzi raccolti via ricerca web (Provincia, ANCI, Prefettura, PNRR) restano in sezione 5 come riferimento/esempio, non più come lista da seedare subito.
- ~~Domini email di ACAM Ambiente, ACAM Acque, ATC Esercizio, Enel, Maris, Ato Rifiuti (sezione 6.2)~~ — **raccolto il 2026-09-15**, vedi indirizzi in sezione 6. Nota bene: sono indirizzi/domini condivisi tra più enti (v. sezione 6) — il design di matching per "dominio" va rivisto per matching su indirizzo esatto.
- ~~Nomi delle sotto-etichette `Gestori/<nome>` (sezione 6.2)~~ — **confermati da Marco il 2026-09-15**: `Gestori/Acam Ambiente`, `Gestori/Acam Acque`, `Gestori/Maris`, `Gestori/Enel`, `Gestori/ATC esercizio`, `Gestori/Ato Rifiuti`.
- ~~Conferma: le mail "Gestori/&lt;nome&gt;" devono creare un'entità tracciabile nel tool o basta l'etichetta Gmail?~~ — **chiuso il 2026-09-15**: sempre un'entità nel tool, mai solo etichetta. Principio generale per tutta la Fase 2, non solo sezione 6.2.

## Rischi noti

- **Migration doppia (Gestore + EnteVario)**: entrambe touccano dati esistenti (Contestazioni e Progetti già creati con l'enum) — script di migrazione dati va scritto e testato in locale prima di girare in produzione, stesso rigore già usato per le migration precedenti di questo progetto.
- **Riconciliazione (sezione 4)**: è la parte più nuova architetturalmente. Va introdotta con un tetto basso (`maxRighe`) e osservata per un po' prima di aumentarne la portata — stesso approccio prudente già usato per il binario Automatico alla sua introduzione (conferma totale alla prima esecuzione).
- **Estrazione zona e vero mittente (sezioni 1-2)**: restano suggerimenti, mai vincolanti — coerente con "nessuna azione è irreversibile" già garantito nella Fase 1.
