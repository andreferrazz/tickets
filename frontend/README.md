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

## Deploying

The image (`Dockerfile`) applies `db/migrations` and then starts the server, so
a container that is up is on its schema. Three things it cannot do for you:

- A database the old Phoenix backend built must be on its last migration
  (`20261006000000`, which drops seating) before this image will start on it;
  otherwise the container exits naming the migration it found. The backend
  left the repository after commit `140e83d`: check that out to run it.
- The environment is in `.env.example`. `INTEGRATIONS` must be `live` (or
  unset) in production, which makes the Abacate Pay and SMTP variables required.
- `ORDER_RECONCILER=on` and the Abacate Pay webhook registration are part of
  the environment, not the image: see the comments in `.env.example`.
