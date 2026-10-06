# E2E.md — the test catalog

The Playwright specs under `frontend/e2e/` are the only automated tests on the
SvelteKit side. There are no unit tests by decision: each spec drives the real
app against a seeded database, with the external services swapped for
in-process fakes.

## Rules

1. A pull request that ports or changes a user flow adds a spec for it, or
   extends the spec that owns the flow, and updates the catalog below in the
   same PR.
2. A spec covers the main path of its flow plus the edge cases that have
   bitten or are likely to. A new edge case is appended to the owning spec and
   gets a mention in that spec's row here.
3. Specs run against `tickets_e2e`, never `backend_dev`. The harness in
   `frontend/e2e/support/database.ts` builds and seeds it; the fixtures in
   `frontend/e2e/support/fixtures.ts` are the only world the specs know.
4. External services never run in e2e. The app boots with `INTEGRATIONS=fake`
   (set in `frontend/playwright.config.ts`), which selects the fake
   implementations in `frontend/src/lib/container.ts`.
5. Specs are F.I.R.S.T.: independent (seeded state only, no ordering),
   repeatable (fixed ids, titles prefixed `E2E`), and fast (seconds).

## Running

```
cd frontend && npm test          # Postgres on localhost:5432
PGPORT=55432 npm test            # a Postgres on another port (PGHOST works too)
```

Needs `pg_dump` and `psql` on the PATH: the schema is copied from `backend_dev`.

## Catalog

| Spec | Flow covered | Edge cases |
| --- | --- | --- |
| `home.spec.ts` | Event list by role: anonymous sees published only, a member sees own-org drafts, an admin sees every draft. Closed filter and search applied server-side | Served HTML never leaks drafts |
| `event-detail.spec.ts` | Event page server-rendered with ticket type and batch; draft visibility by role | Missing, malformed and other-org draft ids are 404, never 403 |

## Planned

One spec per migration step, added by the PR that ports the flow:
`orders` (5), `dashboard` (6), `auth` (7), `event-management` (8),
`organization` (9), `checkin` (10), `checkout` (11), `webhook` and
`order-expiry` (12), `payout` (13).
