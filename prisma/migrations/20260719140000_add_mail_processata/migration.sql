-- CreateEnum
CREATE TYPE "BinarioMail" AS ENUM ('AUTOMATICO', 'MANUALE', 'INCERTO');

-- CreateEnum
CREATE TYPE "EsitoMailProcessata" AS ENUM ('IN_ATTESA', 'COMPLETATO', 'ERRORE');

-- CreateTable
CREATE TABLE "MailProcessata" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mittente" TEXT,
    "oggetto" TEXT,
    "categoriaProposta" TEXT,
    "confidenza" DOUBLE PRECISION,
    "binario" "BinarioMail" NOT NULL,
    "esito" "EsitoMailProcessata" NOT NULL DEFAULT 'IN_ATTESA',
    "entitaCreataId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailProcessata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailProcessata_messageId_key" ON "MailProcessata"("messageId");
