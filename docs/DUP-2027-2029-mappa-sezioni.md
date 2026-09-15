---
name: dup-2027-2029-mappa-sezioni
description: "Mappa delle sezioni del DUP 2027-2029 per Missione/Programma, collegata alle 10 deleghe di Marco. Evita di dover ri-processare le 293 pagine del PDF ad ogni richiesta."
metadata:
  generato: 2026-07-29
  fonte: "docs/DUP 2027-2029.pdf (299 pagine, estratto via pdfplumber)"
---

# DUP 2027-2029 — mappa delle sezioni

Riferimento per orientarsi rapidamente nel PDF `docs/DUP 2027-2029.pdf` senza doverlo rileggere per intero. Valido per tutta la durata del documento (triennio 2027-2029), salvo variazioni/aggiornamenti del DUP stesso (rivedere la mappa se il PDF viene sostituito).

Il DUP è organizzato in due registri diversi, utili per scopi diversi:

- **pag. 61-88 — "Linee programmatiche di mandato 2026/2031"** (a firma del Sindaco Marco Russo, non dell'Assessore): visione politica per macro-aree tematiche (non organizzata per delega). Utile soprattutto per il registro discorsivo/politico e per iniziative trasversali (es. Sportello Casa, PEBA, sistema parcheggi).
- **pag. 89 in poi — "Missione X — Programma Y"**: dettaglio operativo per servizio/ufficio, con azioni concrete, stato di avanzamento e date. Qui si trova il grosso del materiale utile delega per delega.

## Mappa Missione/Programma → pagina (indicativa) → delega

| Missione / Programma | Pag. circa | Delega/e |
|---|---|---|
| Missione 1, Programma 6 — Ufficio Tecnico | 99-104 | Viabilità, Illuminazione Pubblica, Manutenzione Patrimonio, Accessibilità (PEBA/barriere architettoniche) |
| Missione 1, Programma 8 — Sistemi Informativi | 105-112 | Digitalizzazione |
| Missione 8, Programma 1 — Urbanistica e Assetto del Territorio | 148-151 | Politiche Abitative (PUC/residenzialità) — nota: le misure concrete (Sportello Casa, IMU, ex mobilificio Maggiani) sono nelle Linee Programmatiche, pag. 61-62, non qui |
| Missione 9, Programma 1 — Difesa del Suolo | 152-153 | Ambiente (dissesto idrogeologico, canali) |
| Missione 9, Programma 2 — Tutela Ambientale e Sviluppo Sostenibile | 153-156 | Ambiente (Bandiera Blu, Smart Bay, CER, fotovoltaico) |
| Missione 9, Programma 3 — Rifiuti | 156-158 | Ciclo Rifiuti |
| Missione 9, Programma 4/6 — Servizio Idrico Integrato | 158-159 | Sistema Idrico |
| Missione 10, Programma 2 — Trasporto Pubblico Locale | 160-161 | Viabilità (TPL, navette, trasporto marittimo) |
| Missione 10, Programma 5 — Viabilità e Infrastrutture Stradali | 161-162 | Viabilità (segnaletica, Velobox, stalli) |
| Missione 12, Programma 9 — Servizi Necroscopici e Cimiteriali | 171-172 | Cimiteri |

Le 10 deleghe (enum `Delega` in `lib/constants.ts`): Viabilità, Ambiente, Ciclo Rifiuti, Sistema Idrico, Illuminazione Pubblica, Accessibilità, Cimiteri, Politiche Abitative, Digitalizzazione, Manutenzione Patrimonio.

## Documento di sintesi già prodotto

**`docs/DUP 2027-2029 - Punti per delega (Consiglio 31-07).docx`** — elenco dei punti principali per ciascuna delle 10 deleghe, con evidenziazione gialla dei punti che si concludono nel 2026 o sono segnalati "in corso" nel DUP. Creato per la seduta di Consiglio Comunale del 31 luglio 2026, ma il contenuto resta valido per tutto il triennio: consultare **questo file prima** di tornare a processare l'intero PDF.

## Attenzione

Il Sindaco firmatario delle Linee Programmatiche è **Marco Russo** (mandato 2026-2031) — persona diversa dall'Assessore Marco (utente di questo tool), da non confondere quando si citano le "Linee Programmatiche del Sindaco".
