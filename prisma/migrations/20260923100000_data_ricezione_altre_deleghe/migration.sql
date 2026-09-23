-- Data di ricezione della mail di origine sulle entità nate da mail, e destinazione "Altre deleghe"
-- (mail fuori dalle deleghe di Marco, sola etichetta, estendibile al volo).
ALTER TABLE "Pratica" ADD COLUMN "dataRicezione" TIMESTAMP(3);
ALTER TABLE "Progetto" ADD COLUMN "dataRicezione" TIMESTAMP(3);
ALTER TABLE "Contestazione" ADD COLUMN "dataRicezione" TIMESTAMP(3);

CREATE TABLE "AltraDelega" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AltraDelega_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AltraDelega_nome_key" ON "AltraDelega"("nome");
