-- Memoria del mittente (2026-09-21): email del mittente + etichetta finale con cui la mail è stata
-- sistemata, per riconoscere in automatico i mittenti sempre classificati allo stesso modo.
ALTER TABLE "MailProcessata" ADD COLUMN "emailMittente" TEXT;
ALTER TABLE "MailProcessata" ADD COLUMN "etichettaFinale" TEXT;
CREATE INDEX "MailProcessata_emailMittente_idx" ON "MailProcessata"("emailMittente");
