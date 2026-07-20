-- AlterEnum
ALTER TYPE "BinarioMail" ADD VALUE 'NON_RILEVANTE';
ALTER TYPE "BinarioMail" ADD VALUE 'PROPOSTA_CONTINUAZIONE';

-- AlterTable
ALTER TABLE "Progetto" ADD COLUMN "protocollo" TEXT;

-- AlterTable
ALTER TABLE "Contestazione" ADD COLUMN "protocollo" TEXT;

-- AlterTable
ALTER TABLE "MailProcessata" ADD COLUMN "threadId" TEXT;

-- CreateTable
CREATE TABLE "NotaContestazione" (
    "id" TEXT NOT NULL,
    "contestazioneId" TEXT NOT NULL,
    "testo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaContestazione_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "NotaContestazione" ADD CONSTRAINT "NotaContestazione_contestazioneId_fkey" FOREIGN KEY ("contestazioneId") REFERENCES "Contestazione"("id") ON DELETE CASCADE ON UPDATE CASCADE;
