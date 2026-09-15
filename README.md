# lerici-assessore

App Next.js + Prisma + PostgreSQL (Supabase) per la gestione delle attività di Marco Muro come Assessore del Comune di Lerici. Deploy su Vercel.

- **Cosa fa il tool, sezione per sezione**: [FUNZIONALITA-lerici-assessore.md](./FUNZIONALITA-lerici-assessore.md)
- **Scoperte tecniche e gotcha da conoscere prima di rifare cose simili**: [NOTE-TECNICHE.md](./NOTE-TECNICHE.md)
- **Specifiche storiche delle feature già implementate** (per il "perché" delle decisioni): [docs/specs-storiche/](./docs/specs-storiche/)
- **Istruzioni per agenti AI che lavorano su questo repo**: [AGENTS.md](./AGENTS.md)

## Sviluppo locale

```bash
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

Variabili d'ambiente: vedi `.env.local` (sviluppo) — attenzione alla nota #1 e #17 in NOTE-TECNICHE.md su come Vercel gestisce le env var in produzione.

## Deploy

Su Vercel, dal branch principale (`npx vercel --prod`). Vedi NOTE-TECNICHE.md per i limiti del piano Hobby (cron, `maxDuration`) e le note su migrazioni Prisma/Supabase.
