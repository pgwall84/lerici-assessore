-- CreateEnum
CREATE TYPE "TipoProgetto" AS ENUM ('PROGETTO', 'ATTIVITA');

-- AlterTable
ALTER TABLE "Progetto" ADD COLUMN "tipo" "TipoProgetto" NOT NULL DEFAULT 'PROGETTO';

-- AlterTable
ALTER TABLE "MailProcessata" ADD COLUMN "etichettaProposta" TEXT;
