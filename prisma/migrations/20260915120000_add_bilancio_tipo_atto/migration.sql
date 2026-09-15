-- Fase 2 sezione 7: nuovo TipoAtto per Bilancio (previsione/rendiconto/variazioni), stesso
-- trattamento già dato a DUP — volumi bassi confermati da Marco, resta un enum (non un modello:
-- a differenza di Gestore/EnteVario non serve estenderlo al volo).
ALTER TYPE "TipoAtto" ADD VALUE 'BILANCIO';
