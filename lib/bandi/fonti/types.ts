export interface BandoRaw {
  titolo: string;
  ente: string;
  fonteUrl: string;
  bandoUrl?: string;
  descrizione?: string;
  dotazione?: string;
  beneficiari?: string;
  dataApertura?: Date;
  dataChiusura?: Date;
  // Popolati dalle fonti già convertite a estrazione via AI (lib/bandi/estrazione-ai.ts).
  // Finché una fonte non è convertita, restano undefined e isBandoRilevante() usa il vecchio
  // fallback a regole testuali — vedi lib/bandi/filtro-territoriale.ts.
  ambitoTerritoriale?: "liguria" | "nazionale" | "altra_regione" | "non_specificato";
  sogliaPopolazione?: number;
  tipoBeneficiario?: "ENTE_PUBBLICO" | "IMPRESA" | "MISTO" | "CITTADINO";
}

// Ritorno di ogni parser di fonte: i bandi trovati più le statistiche di estrazione, per rendere
// visibili (log + eventuale alert Telegram) i fallimenti tecnici invece di tradursi solo in
// "meno bandi salvati" senza che nessuno se ne accorga. Le fonti non ancora convertite a
// estrazione AI (lib/bandi/estrazione-ai.ts) ritornano estratti=bandi.length, nonBando=0,
// falliti=0 — non fanno ancora questa distinzione.
export interface RisultatoFonte {
  bandi: BandoRaw[];
  candidati: number; // pagine/righe/box esaminati in questo run
  estratti: number;  // bandi estratti con successo
  nonBando: number;  // l'AI ha determinato correttamente che non è un bando (non un errore)
  falliti: number;   // fallimento tecnico: fetch, JSON malformato, errore API, enum non valido
}
