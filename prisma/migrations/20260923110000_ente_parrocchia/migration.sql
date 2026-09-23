-- Nuovo ente istituzionale "Parrocchia" (richiesta di Marco, 2026-09-23). Idempotente: se l'ente
-- fosse già stato creato al volo dal form, non fa nulla.
INSERT INTO "EnteVario" ("id", "nome")
SELECT 'ente-parrocchia', 'Parrocchia'
WHERE NOT EXISTS (SELECT 1 FROM "EnteVario" WHERE lower("nome") = 'parrocchia');
