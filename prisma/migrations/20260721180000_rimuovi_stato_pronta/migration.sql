-- Riassegna eventuali righe rimaste in PRONTA a IN_PREPARAZIONE (nessuna riga persa, solo
-- rinominata concettualmente) PRIMA di rimuovere il valore dall'enum: Postgres non permette di
-- eliminare un valore enum ancora referenziato da una colonna.
UPDATE "Riunione" SET "stato" = 'IN_PREPARAZIONE' WHERE "stato" = 'PRONTA';

-- Postgres non supporta DROP VALUE su un enum: si crea un nuovo tipo senza PRONTA, si sposta la
-- colonna sul nuovo tipo, si elimina il vecchio tipo e si rinomina il nuovo con lo stesso nome.
CREATE TYPE "StatoRiunione_new" AS ENUM ('IN_PREPARAZIONE', 'IN_CORSO', 'CONCLUSA');

ALTER TABLE "Riunione" ALTER COLUMN "stato" DROP DEFAULT;
ALTER TABLE "Riunione" ALTER COLUMN "stato" TYPE "StatoRiunione_new" USING ("stato"::text::"StatoRiunione_new");
ALTER TABLE "Riunione" ALTER COLUMN "stato" SET DEFAULT 'IN_PREPARAZIONE';

DROP TYPE "StatoRiunione";
ALTER TYPE "StatoRiunione_new" RENAME TO "StatoRiunione";
