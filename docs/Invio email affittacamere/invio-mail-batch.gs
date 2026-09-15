/**
 * INVIO MASSIVO EMAIL A SCAGLIONI — Nota affittacamere/CAV corretto conferimento rifiuti
 * Comune di Lerici
 *
 * COME FUNZIONA
 * - Legge i destinatari da un Google Sheet (una riga per attività).
 * - Manda l'email con il PDF allegato tramite GmailApp (quindi con il TUO account Gmail).
 * - A ogni esecuzione manda al massimo BATCH_SIZE email, con una pausa fra l'una e l'altra.
 * - Segna su foglio quali righe sono già state inviate, così può fermarsi e ripartire
 *   senza mai duplicare un invio.
 * - Un trigger a tempo lo fa girare da solo ogni tot minuti, spalmando l'invio su più
 *   giorni finché non finisce la lista o la quota giornaliera di Gmail via script (100/giorno
 *   su account personale, si resetta 24h dopo il primo invio della giornata).
 *
 * SETUP (una tantum)
 * 1. Crea un Google Sheet con queste colonne, a partire dalla riga 1 (intestazioni):
 *      A: Nome Attività   B: Email   C: Stato   D: Data Invio
 *    Le colonne C e D le scrive lo script da solo, lasciale vuote all'inizio.
 * 2. Carica il PDF della nota su Google Drive. Apri il file, "Condividi" > copia il link,
 *    e prendi l'ID che sta tra /d/ e /view nell'URL (una stringa tipo 1A2b3C...xyz).
 *    Incollalo qui sotto in CONFIG.PDF_FILE_ID.
 * 3. Apri il foglio > Estensioni > Apps Script. Cancella il contenuto di default e
 *    incolla questo intero file.
 * 4. Aggiorna CONFIG qui sotto (nome del foglio, ID del PDF, testo email se vuoi cambiarlo).
 * 5. Esegui UNA VOLTA manualmente la funzione "inviaBatch" dal menu in alto (▶) per
 *    autorizzare gli accessi richiesti (Gmail e Drive) — Google chiederà conferma,
 *    è normale, è il tuo stesso script sul tuo account.
 * 6. Esegui UNA VOLTA "creaTriggerPeriodico" per attivare l'invio automatico.
 *    Da quel momento lo script manda da solo un blocco di email ogni 30 minuti,
 *    tutti i giorni, finché non ha finito la lista (o si ferma da solo e ti avvisa via email).
 *
 * PER FERMARLO A MANO: esegui la funzione "rimuoviTrigger".
 */

const CONFIG = {
  // Nome esatto del foglio (tab in basso) dentro lo Spreadsheet
  SHEET_NAME: 'Destinatari',

  // Colonne (1 = A, 2 = B, ...)
  COL_NOME: 1,
  COL_EMAIL: 2,
  COL_STATO: 3,
  COL_DATA: 4,

  // ID del file PDF su Google Drive (vedi istruzioni sopra)
  PDF_FILE_ID: 'INSERISCI_QUI_ID_FILE_DRIVE',

  // Quante email mandare a ogni esecuzione dello script
  BATCH_SIZE: 10,

  // Pausa fra un'email e l'altra dentro lo stesso batch (millisecondi)
  DELAY_MS_TRA_EMAIL: 4000,

  // Ogni quanti minuti far ripartire lo script da solo (vedi creaTriggerPeriodico)
  MINUTI_TRA_ESECUZIONI: 30,

  OGGETTO: 'Corretto conferimento dei rifiuti — nota informativa',

  // Nome che compare come mittente (l'indirizzo resta comunque il tuo Gmail)
  MITTENTE_NOME: "Marco Muro - Assessore all'Ambiente e al Ciclo dei Rifiuti, Comune di Lerici",
};

/**
 * Funzione principale: manda un blocco di email e si ferma.
 * Va eseguita a mano la prima volta (per autorizzare), poi ci pensa il trigger.
 */
function inviaBatch() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    throw new Error('Foglio "' + CONFIG.SHEET_NAME + '" non trovato. Controlla CONFIG.SHEET_NAME.');
  }

  const data = sheet.getDataRange().getValues();
  const pdfBlob = DriveApp.getFileById(CONFIG.PDF_FILE_ID).getBlob();

  let quotaRimanente = MailApp.getRemainingDailyQuota();
  if (quotaRimanente <= 0) {
    Logger.log('Quota giornaliera esaurita. Riprovo automaticamente domani.');
    return;
  }

  let inviateOra = 0;

  for (let i = 1; i < data.length; i++) { // riga 0 = intestazioni, si parte da riga 1
    if (inviateOra >= CONFIG.BATCH_SIZE) break;
    if (quotaRimanente <= 0) {
      Logger.log('Quota esaurita durante questo giro, mi fermo qui.');
      break;
    }

    const nome = data[i][CONFIG.COL_NOME - 1];
    const email = String(data[i][CONFIG.COL_EMAIL - 1] || '').trim();
    const stato = data[i][CONFIG.COL_STATO - 1];

    if (stato === 'Inviata') continue; // già fatta, salto
    if (!email) continue; // riga senza indirizzo, salto

    try {
      GmailApp.sendEmail(email, CONFIG.OGGETTO, costruisciTesto(nome), {
        attachments: [pdfBlob],
        name: CONFIG.MITTENTE_NOME,
      });

      sheet.getRange(i + 1, CONFIG.COL_STATO).setValue('Inviata');
      sheet.getRange(i + 1, CONFIG.COL_DATA).setValue(new Date());

      inviateOra++;
      quotaRimanente--;

      // pausa random per non essere troppo meccanico (4-6 secondi circa)
      Utilities.sleep(CONFIG.DELAY_MS_TRA_EMAIL + Math.floor(Math.random() * 2000));

    } catch (e) {
      sheet.getRange(i + 1, CONFIG.COL_STATO).setValue('ERRORE: ' + e.message);
      Logger.log('Errore alla riga ' + (i + 1) + ' (' + email + '): ' + e.message);
    }
  }

  Logger.log('Inviate in questo giro: ' + inviateOra + ' — quota rimasta oggi: ' + quotaRimanente);

  verificaSeFinito(sheet, data.length);
}

/** Testo dell'email, personalizzato con il nome attività se presente. */
function costruisciTesto(nomeAttivita) {
  const saluto = nomeAttivita ? 'Gentile ' + nomeAttivita + ',' : 'Gentile Gestore,';
  return saluto + '\n\n' +
    "in allegato una nota informativa sul corretto conferimento dei rifiuti per le strutture " +
    "ricettive extra-alberghiere. La preghiamo di prenderne visione e di darne diffusione " +
    "anche al personale eventualmente incaricato (es. addetti alle pulizie).\n\n" +
    'Cordiali saluti,\n' +
    'Marco Muro\n' +
    "Assessore all'Ambiente e al Ciclo dei Rifiuti\n" +
    'Comune di Lerici';
}

/** Se tutte le righe sono a "Inviata", ferma il trigger e manda un avviso di fine invio. */
function verificaSeFinito(sheet, numRighe) {
  const stati = sheet.getRange(2, CONFIG.COL_STATO, numRighe - 1, 1).getValues();
  const tutteFatte = stati.every(r => r[0] === 'Inviata');
  if (tutteFatte) {
    rimuoviTrigger();
    MailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      'Invio nota affittacamere completato',
      'Tutte le email della lista sono state inviate. Il trigger automatico è stato disattivato.'
    );
    Logger.log('Tutte le email inviate. Trigger rimosso.');
  }
}

/** Attiva l'invio automatico a scaglioni. Eseguila una volta sola dopo il primo test manuale. */
function creaTriggerPeriodico() {
  rimuoviTrigger(); // evita doppioni se la esegui più volte
  ScriptApp.newTrigger('inviaBatch')
    .timeBased()
    .everyMinutes(CONFIG.MINUTI_TRA_ESECUZIONI)
    .create();
  Logger.log('Trigger creato: invio automatico ogni ' + CONFIG.MINUTI_TRA_ESECUZIONI + ' minuti.');
}

/** Ferma l'invio automatico. Le email già segnate "Inviata" restano tali. */
function rimuoviTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'inviaBatch') ScriptApp.deleteTrigger(t);
  });
}
