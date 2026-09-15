<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# lerici-assessore — prima di lavorare

Questo file viene caricato automaticamente ad ogni sessione (via `CLAUDE.md` → `@AGENTS.md`). Prima di iniziare qualunque task non banale su questo progetto:

1. Leggi **FUNZIONALITA-lerici-assessore.md** — stato funzionale attuale, sezione per sezione (verificato contro il codice reale, non solo intenzioni di design).
2. Leggi **NOTE-TECNICHE.md** — gotcha già scoperti (Vercel env vars, Supabase Storage, Prisma migration drift, ecc.). Controllalo prima di rifare da capo un debug già fatto.
3. Solo se serve capire **perché** una feature è stata progettata in un certo modo (non solo cosa fa oggi), consulta `docs/specs-storiche/` — sono specifiche superate dall'implementazione reale, tenute solo per il razionale delle decisioni.

Questi tre documenti riassumono lo stato del progetto, ma **non sostituiscono la lettura del codice sorgente specifico** che stai per modificare — i documenti possono essere leggermente disallineati dal codice reale (è già successo: vedi nota su Regione Liguria in FUNZIONALITA). Trattali come punto di partenza per orientarti più in fretta, non come fonte di verità assoluta su un singolo file.

Se una modifica cambia comportamento o introduce una scoperta tecnica non ovvia, aggiorna FUNZIONALITA-lerici-assessore.md e/o NOTE-TECNICHE.md nello stesso commit — è così che questi documenti restano affidabili invece di invecchiare in silenzio.
