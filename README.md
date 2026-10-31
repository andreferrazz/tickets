# Tickets

The SvelteKit app: pages, form actions and the server modules behind them.
Conventions are in `CLAUDE.md`; the test catalog is `E2E.md`.

```bash
cp .env.example .env         # then set DATABASE_URL; INTEGRATIONS=fake
npm ci
npm run db:migrate           # applies db/migrations to DATABASE_URL
npm run dev
npm test                     # Playwright; PGPORT/PGHOST point it at another Postgres
npm run check                # svelte-check over src, db and e2e
```

## How a purchase works

1. An organizer prices a ticket batch or an extra. The app creates the matching
   Abacate Pay product right then, so nothing priced is ever on sale without
   one. Free rows get no product.
2. A buyer picks tickets and extras on the event page. The order is created as
   pending and its stock is taken in the same transaction, so two buyers can
   never get the last ticket.
3. A free order is paid on the spot. Anything else opens an Abacate Pay
   checkout (Pix or card) or a boleto, and the buyer is sent there to pay. If
   the checkout cannot be opened, the stock is given back.
4. Abacate Pay calls `/webhooks/abacate-pay` when the payment lands. The order
   is marked paid, its passes are issued (one QR code per ticket, one for all
   the extras) and mailed. Repeated deliveries change nothing.
5. Every ten minutes a sweep looks at orders pending for over fifteen minutes.
   Paid at Abacate Pay means a webhook was missed, so the order is fulfilled;
   otherwise it expires and its stock returns. A boleto is held until its due
   date, and an order Abacate Pay cannot be asked about is left for next time.
6. A refund at Abacate Pay arrives by webhook too: the stock returns and the
   passes stop scanning.

The design notes from the first, Phoenix-based version of the app lived in
`PLAN.md` until it was removed as out of date; it is in the history at
commit `b53dae1`.

## Deploying

The image (`Dockerfile`) applies `db/migrations` and then starts the server, so
a container that is up is on its schema. Three things it cannot do for you:

- A database the old Phoenix backend built must be on its last migration
  (`20261006000000`, which drops seating) before this image will start on it;
  otherwise the container exits naming the migration it found. The backend
  left the repository after commit `140e83d`: check that out to run it.
- The environment is in `.env.example`. `INTEGRATIONS` must be `live` (or
  unset) in production, which makes the Abacate Pay and SMTP variables required.
- `ORIGIN`, `ORG_NAME` and the Abacate Pay webhook registration are part of
  the environment, not the image: see the comments in `.env.example`. Without
  `ORIGIN` or `ORG_NAME` the server refuses to start.

One deployment serves one organization. `ORG_NAME` names it, every person's
role lives on their `users` row (buyer, staff, member, leader, admin), and a
second organization is a second deployment with its own database, domain and
Abacate Pay key.

The first visit to a database with no admin shows a setup form instead of
any page: it asks for the admin's email, creates that account and sends them
through the normal login code. The form answers 404 once an admin exists, so
a second admin is a role change in the database.
