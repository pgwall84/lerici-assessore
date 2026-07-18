-- CreateEnum
CREATE TYPE "StatoProgetto" AS ENUM ('IN_CORSO', 'SOSPESO', 'CONCLUSO', 'ARCHIVIATO');

-- CreateTable
CREATE TABLE "Progetto" (
    "id" TEXT NOT NULL,
    "titolo" TEXT NOT NULL,
    "delega" "Delega" NOT NULL,
    "stato" "StatoProgetto" NOT NULL DEFAULT 'IN_CORSO',
    "responsabileId" INTEGER,
    "fonteFinanziamento" TEXT,
    "bandoId" TEXT,
    "descrizione" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Progetto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaProgetto" (
    "id" TEXT NOT NULL,
    "progettoId" TEXT NOT NULL,
    "testo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaProgetto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoProgetto" (
    "id" TEXT NOT NULL,
    "progettoId" TEXT NOT NULL,
    "nomeFile" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoProgetto_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Progetto" ADD CONSTRAINT "Progetto_responsabileId_fkey" FOREIGN KEY ("responsabileId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaProgetto" ADD CONSTRAINT "NotaProgetto_progettoId_fkey" FOREIGN KEY ("progettoId") REFERENCES "Progetto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoProgetto" ADD CONSTRAINT "DocumentoProgetto_progettoId_fkey" FOREIGN KEY ("progettoId") REFERENCES "Progetto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
