-- CreateEnum
CREATE TYPE "TipoBeneficiario" AS ENUM ('ENTE_PUBBLICO', 'IMPRESA', 'MISTO', 'CITTADINO');

-- AlterTable
ALTER TABLE "Bando" ADD COLUMN "sogliaPopolazione" INTEGER;
ALTER TABLE "Bando" ADD COLUMN "tipoBeneficiario" "TipoBeneficiario";
