-- CreateTable
CREATE TABLE "Giustifica" (
    "id" TEXT NOT NULL,
    "ufficioMittente" TEXT,
    "oggetto" TEXT NOT NULL,
    "dataRicezione" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inoltrata" BOOLEAN NOT NULL DEFAULT false,
    "inoltrataAt" TIMESTAMP(3),
    "visualizzata" BOOLEAN NOT NULL DEFAULT false,
    "visualizzataAt" TIMESTAMP(3),
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Giustifica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoGiustifica" (
    "id" TEXT NOT NULL,
    "giustificaId" TEXT NOT NULL,
    "nomeFile" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoGiustifica_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DocumentoGiustifica" ADD CONSTRAINT "DocumentoGiustifica_giustificaId_fkey" FOREIGN KEY ("giustificaId") REFERENCES "Giustifica"("id") ON DELETE CASCADE ON UPDATE CASCADE;
