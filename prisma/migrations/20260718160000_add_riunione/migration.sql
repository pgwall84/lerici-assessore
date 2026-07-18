-- CreateEnum
CREATE TYPE "StatoRiunione" AS ENUM ('IN_PREPARAZIONE', 'PRONTA', 'IN_CORSO', 'CONCLUSA');

-- CreateTable
CREATE TABLE "Riunione" (
    "id" TEXT NOT NULL,
    "titolo" TEXT NOT NULL,
    "personaId" INTEGER,
    "progettoId" TEXT,
    "dataOra" TIMESTAMP(3),
    "stato" "StatoRiunione" NOT NULL DEFAULT 'IN_PREPARAZIONE',
    "trascrizioneGrezza" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Riunione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArgomentoRiunione" (
    "id" TEXT NOT NULL,
    "riunioneId" TEXT NOT NULL,
    "testo" TEXT NOT NULL,
    "ordine" INTEGER NOT NULL,
    "spuntato" BOOLEAN NOT NULL DEFAULT false,
    "spuntatoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArgomentoRiunione_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Riunione" ADD CONSTRAINT "Riunione_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Riunione" ADD CONSTRAINT "Riunione_progettoId_fkey" FOREIGN KEY ("progettoId") REFERENCES "Progetto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArgomentoRiunione" ADD CONSTRAINT "ArgomentoRiunione_riunioneId_fkey" FOREIGN KEY ("riunioneId") REFERENCES "Riunione"("id") ON DELETE CASCADE ON UPDATE CASCADE;
