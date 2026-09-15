-- Fase 2 (2026-09-15, richiesta di Marco): SottoTema — livello facoltativo sotto una Delega,
-- rispecchia i sotto-temi che gestiva solo a mano su Gmail (Segnalazioni/<Delega>/<SottoTema>).
-- Modello (non enum), estendibile al volo senza migration, stesso pattern di EnteVario/Gestore.
CREATE TABLE "SottoTema" (
    "id" TEXT NOT NULL,
    "delega" "Delega" NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SottoTema_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SottoTema_delega_nome_key" ON "SottoTema"("delega", "nome");

-- Seed: i 4 sotto-temi già esistenti come etichette Gmail (creati da Marco prima che il tool li
-- gestisse), così vengono riconosciuti subito senza doverli ricreare a mano nel form.
INSERT INTO "SottoTema" ("id", "delega", "nome") VALUES
    ('sottotema-ambiente-sfalci', 'AMBIENTE', 'Sfalci'),
    ('sottotema-rifiuti-degrado', 'RIFIUTI', 'Degrado'),
    ('sottotema-rifiuti-ingombranti', 'RIFIUTI', 'Ingombranti'),
    ('sottotema-rifiuti-mancati-ritiri', 'RIFIUTI', 'Mancati Ritiri');

ALTER TABLE "Pratica" ADD COLUMN "sottoTemaId" TEXT;

ALTER TABLE "Pratica" ADD CONSTRAINT "Pratica_sottoTemaId_fkey"
    FOREIGN KEY ("sottoTemaId") REFERENCES "SottoTema"("id") ON DELETE SET NULL ON UPDATE CASCADE;
