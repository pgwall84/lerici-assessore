-- CreateEnum
CREATE TYPE "TipoPratica" AS ENUM ('SEGNALAZIONE', 'MIA_IDEA', 'PROGETTO');

-- CreateEnum
CREATE TYPE "Delega" AS ENUM ('VIABILITA', 'AMBIENTE', 'RIFIUTI', 'SISTEMA_IDRICO', 'ILLUMINAZIONE', 'ACCESSIBILITA', 'CIMITERI', 'POLITICHE_ABITATIVE', 'DIGITALIZZAZIONE', 'MANUTENZIONE_PATRIMONIO');

-- CreateEnum
CREATE TYPE "StatoPratica" AS ENUM ('APERTA', 'IN_CORSO', 'CHIUSA', 'SOSPESA', 'APPUNTO', 'IN_VALUTAZIONE', 'PROMOSSA', 'ARCHIVIATA');

-- CreateEnum
CREATE TYPE "Priorita" AS ENUM ('NORMALE', 'URGENTE');

-- CreateTable
CREATE TABLE "Pratica" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoPratica" NOT NULL,
    "delega" "Delega" NOT NULL,
    "titolo" TEXT NOT NULL,
    "descrizione" TEXT,
    "luogo" TEXT,
    "stato" "StatoPratica" NOT NULL DEFAULT 'APERTA',
    "priorita" "Priorita" NOT NULL DEFAULT 'NORMALE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chiusaAt" TIMESTAMP(3),
    "personaId" INTEGER,

    CONSTRAINT "Pratica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segnalante" (
    "id" SERIAL NOT NULL,
    "praticaId" INTEGER NOT NULL,
    "nome" TEXT,
    "telefono" TEXT,
    "email" TEXT,

    CONSTRAINT "Segnalante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "ruolo" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Foto" (
    "id" SERIAL NOT NULL,
    "praticaId" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Foto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nota" (
    "id" SERIAL NOT NULL,
    "praticaId" INTEGER NOT NULL,
    "testo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoricoStato" (
    "id" SERIAL NOT NULL,
    "praticaId" INTEGER NOT NULL,
    "statoPrecedente" "StatoPratica",
    "statoNuovo" "StatoPratica" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoricoStato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appuntamento" (
    "id" SERIAL NOT NULL,
    "praticaId" INTEGER,
    "titolo" TEXT NOT NULL,
    "descrizione" TEXT,
    "luogo" TEXT,
    "dataOra" TIMESTAMP(3) NOT NULL,
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appuntamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Utente" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "telegramChatId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Utente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Segnalante_praticaId_key" ON "Segnalante"("praticaId");

-- CreateIndex
CREATE UNIQUE INDEX "Utente_email_key" ON "Utente"("email");

-- AddForeignKey
ALTER TABLE "Pratica" ADD CONSTRAINT "Pratica_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segnalante" ADD CONSTRAINT "Segnalante_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoricoStato" ADD CONSTRAINT "StoricoStato_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appuntamento" ADD CONSTRAINT "Appuntamento_praticaId_fkey" FOREIGN KEY ("praticaId") REFERENCES "Pratica"("id") ON DELETE SET NULL ON UPDATE CASCADE;
