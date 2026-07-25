-- CreateEnum
CREATE TYPE "CategoriaVaria" AS ENUM ('COMUNICAZIONI', 'ANCI', 'REGIONE', 'GOVERNO');

-- AlterTable
ALTER TABLE "Progetto" ALTER COLUMN "delega" DROP NOT NULL;
ALTER TABLE "Progetto" ADD COLUMN "categoriaVaria" "CategoriaVaria";
