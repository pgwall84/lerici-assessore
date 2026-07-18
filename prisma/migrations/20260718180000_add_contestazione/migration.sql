-- CreateEnum
CREATE TYPE "Gestore" AS ENUM ('ACAM_AMBIENTE', 'ACAM_ACQUE', 'ATC');

-- CreateEnum
CREATE TYPE "EsitoContestazione" AS ENUM ('IN_ATTESA', 'RISOLTO', 'RESPINTO', 'SENZA_RISPOSTA');

-- CreateTable
CREATE TABLE "Contestazione" (
    "id" TEXT NOT NULL,
    "gestore" "Gestore" NOT NULL,
    "oggetto" TEXT NOT NULL,
    "descrizione" TEXT,
    "dataInvio" TIMESTAMP(3),
    "esito" "EsitoContestazione" NOT NULL DEFAULT 'IN_ATTESA',
    "noteEsito" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contestazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoContestazione" (
    "id" TEXT NOT NULL,
    "contestazioneId" TEXT NOT NULL,
    "nomeFile" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoContestazione_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DocumentoContestazione" ADD CONSTRAINT "DocumentoContestazione_contestazioneId_fkey" FOREIGN KEY ("contestazioneId") REFERENCES "Contestazione"("id") ON DELETE CASCADE ON UPDATE CASCADE;
