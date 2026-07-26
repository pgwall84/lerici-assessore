ALTER TABLE "AttoPoliticoAmministrativo" ADD COLUMN "responsabileId" INTEGER;
ALTER TABLE "AttoPoliticoAmministrativo" ADD CONSTRAINT "AttoPoliticoAmministrativo_responsabileId_fkey" FOREIGN KEY ("responsabileId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "NotaAtto" (
    "id" TEXT NOT NULL,
    "attoId" TEXT NOT NULL,
    "testo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaAtto_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NotaAtto" ADD CONSTRAINT "NotaAtto_attoId_fkey" FOREIGN KEY ("attoId") REFERENCES "AttoPoliticoAmministrativo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
