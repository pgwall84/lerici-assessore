-- Fase 2 sezione 6.1: Gestore da enum a modello (permette di aggiungere gestori senza migration).
-- Nota: un TYPE e una TABLE non possono coesistere con lo stesso nome nello stesso schema
-- Postgres (stesso namespace pg_type) — il vecchio enum "Gestore" va rinominato PRIMA di creare
-- la nuova tabella "Gestore", altrimenti CREATE TABLE fallisce con "already exists".
ALTER TYPE "Gestore" RENAME TO "GestoreEnumVecchio";

CREATE TABLE "Gestore" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "dominio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gestore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Gestore_nome_key" ON "Gestore"("nome");

-- Seed: i 4 gestori già esistenti (stessi nomi mostrati oggi in UI) + Maris (nuovo, sezione 6).
INSERT INTO "Gestore" ("id", "nome") VALUES
    ('gestore-acam-ambiente', 'ACAM Ambiente'),
    ('gestore-acam-acque', 'ACAM Acque'),
    ('gestore-atc-esercizio', 'ATC Esercizio'),
    ('gestore-enel', 'Enel'),
    ('gestore-maris', 'Maris');

-- Nuova colonna FK su Contestazione, backfill dai valori del vecchio enum, poi rimozione
-- della colonna e del tipo vecchi.
ALTER TABLE "Contestazione" ADD COLUMN "gestoreId" TEXT;

UPDATE "Contestazione" SET "gestoreId" = CASE "gestore"::text
    WHEN 'ACAM_AMBIENTE' THEN 'gestore-acam-ambiente'
    WHEN 'ACAM_ACQUE' THEN 'gestore-acam-acque'
    WHEN 'ATC' THEN 'gestore-atc-esercizio'
    WHEN 'ENEL' THEN 'gestore-enel'
END;

ALTER TABLE "Contestazione" ALTER COLUMN "gestoreId" SET NOT NULL;

ALTER TABLE "Contestazione" ADD CONSTRAINT "Contestazione_gestoreId_fkey"
    FOREIGN KEY ("gestoreId") REFERENCES "Gestore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Contestazione" DROP COLUMN "gestore";

DROP TYPE "GestoreEnumVecchio";
