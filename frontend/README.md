# Tickets frontend

The SvelteKit app: pages, form actions and the server modules behind them.
Conventions are in `../CLAUDE.md`; the test catalog is `../E2E.md`.

```
cp .env.example .env         # then set DATABASE_URL; INTEGRATIONS=fake needs no secrets
npm ci
npm run db:migrate           # applies db/migrations to DATABASE_URL
npm run dev
npm test                     # Playwright; PGPORT/PGHOST point it at another Postgres
npm run check                # svelte-check over src, db and e2e
```
