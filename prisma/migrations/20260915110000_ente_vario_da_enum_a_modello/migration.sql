-- Fase 2 sezione 5: CategoriaVaria da enum a modello EnteVario (permette di aggiungere un ente
-- senza migration). Stesso trucco già usato per Gestore (sezione 6.1): un TYPE e una TABLE non
-- possono coesistere con lo stesso nome nello stesso schema Postgres, quindi il vecchio enum va
-- rinominato PRIMA di creare la nuova tabella con lo stesso nome del tipo originale.
ALTER TYPE "CategoriaVaria" RENAME TO "CategoriaVariaEnumVecchio";

CREATE TABLE "EnteVario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "dominio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnteVario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnteVario_nome_key" ON "EnteVario"("nome");

-- Seed: i 4 valori enum già esistenti (stessi nomi già usati per le etichette Gmail "Varie/<nome>"
-- — non li rinominiamo per non rompere l'istradamento automatico già in produzione) + i nuovi enti
-- richiesti subito da Marco (forze dell'ordine e soccorso, sezione 5).
INSERT INTO "EnteVario" ("id", "nome") VALUES
    ('ente-comunicazioni', 'Comunicazioni'),
    ('ente-anci', 'ANCI'),
    ('ente-regione', 'Regione'),
    ('ente-governo', 'Governo'),
    ('ente-questura-la-spezia', 'Questura della Spezia'),
    ('ente-carabinieri-lerici', 'Carabinieri — Stazione di Lerici'),
    ('ente-carabinieri-sarzana', 'Carabinieri — Stazione di Sarzana'),
    ('ente-carabinieri-comando-prov-sp', 'Carabinieri — Comando Provinciale La Spezia'),
    ('ente-carabinieri-la-spezia', 'Carabinieri — Stazione La Spezia'),
    ('ente-vigili-fuoco-la-spezia', 'Vigili del Fuoco — Comando di La Spezia');

-- Nuova colonna FK su Progetto, backfill dai valori del vecchio enum, poi rimozione della colonna
-- e del tipo vecchi. La colonna resta nullable (un Progetto può non avere né delega né ente).
ALTER TABLE "Progetto" ADD COLUMN "enteVarioId" TEXT;

UPDATE "Progetto" SET "enteVarioId" = CASE "categoriaVaria"::text
    WHEN 'COMUNICAZIONI' THEN 'ente-comunicazioni'
    WHEN 'ANCI' THEN 'ente-anci'
    WHEN 'REGIONE' THEN 'ente-regione'
    WHEN 'GOVERNO' THEN 'ente-governo'
    ELSE NULL
END
WHERE "categoriaVaria" IS NOT NULL;

ALTER TABLE "Progetto" ADD CONSTRAINT "Progetto_enteVarioId_fkey"
    FOREIGN KEY ("enteVarioId") REFERENCES "EnteVario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Progetto" DROP COLUMN "categoriaVaria";

DROP TYPE "CategoriaVariaEnumVecchio";
