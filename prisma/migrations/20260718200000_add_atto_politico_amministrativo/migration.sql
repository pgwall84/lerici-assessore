-- CreateEnum
CREATE TYPE "TipoAtto" AS ENUM ('CONVOCAZIONE_GIUNTA', 'CONVOCAZIONE_CONSIGLIO', 'CONVOCAZIONE_COMMISSIONE', 'MOZIONE', 'INTERROGAZIONE');

-- CreateEnum
CREATE TYPE "StatoAtto" AS ENUM ('DA_ESAMINARE', 'ESAMINATO', 'RISPOSTO', 'ARCHIVIATO');

-- CreateEnum
CREATE TYPE "RuoloDocumento" AS ENUM ('ORDINE_GIORNO', 'PRATICA_ALLEGATA');

-- CreateTable
CREATE TABLE "AttoPoliticoAmministrativo" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAtto" NOT NULL,
    "dataSeduta" TIMESTAMP(3),
    "oggetto" TEXT NOT NULL,
    "odgTestoEstratto" TEXT,
    "scadenzaRisposta" TIMESTAMP(3),
    "consiglioCollegatoId" TEXT,
    "stato" "StatoAtto" NOT NULL DEFAULT 'DA_ESAMINARE',
    "visualizzato" BOOLEAN NOT NULL DEFAULT false,
    "visualizzatoAt" TIMESTAMP(3),
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttoPoliticoAmministrativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoAtto" (
    "id" TEXT NOT NULL,
    "attoId" TEXT NOT NULL,
    "nomeFile" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "ruolo" "RuoloDocumento" NOT NULL DEFAULT 'PRATICA_ALLEGATA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoAtto_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AttoPoliticoAmministrativo" ADD CONSTRAINT "AttoPoliticoAmministrativo_consiglioCollegatoId_fkey" FOREIGN KEY ("consiglioCollegatoId") REFERENCES "AttoPoliticoAmministrativo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoAtto" ADD CONSTRAINT "DocumentoAtto_attoId_fkey" FOREIGN KEY ("attoId") REFERENCES "AttoPoliticoAmministrativo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
