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
   `frontend/e2e/support/database.ts` builds it from the SQL migrations in
   `frontend/db/migrations` and seeds it; the fixtures in
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

Needs only a reachable Postgres: the schema comes from `frontend/db/migrations`,
the same files `npm run db:migrate` applies everywhere else.

## Catalog

| Spec | Flow covered | Edge cases |
| --- | --- | --- |
| `home.spec.ts` | Event list by role: anonymous sees published only, a member sees own-org drafts, an admin sees every draft. Closed filter and search applied server-side | Served HTML never leaks drafts |
| `event-detail.spec.ts` | Event page server-rendered with ticket type and batch; draft visibility by role | Missing, malformed and other-org draft ids are 404, never 403 |
| `orders.spec.ts` | Buyer's order list and order detail server-rendered: items, total, one QR per pass, payment link while pending; anonymous sent to login with `next` | Another buyer's order, missing and malformed ids are 404, never 403 |
| `dashboard.spec.ts` | Creator dashboard and event orders server-rendered: revenue, stock, recent orders, buyers of an item from the `buyers` query parameter, validated counts | Another organization's event is 404 for a manager, 200 for an admin; anonymous sent to login with `next` |
| `management.spec.ts` | Organization team page (members, invitations), admin users, admin invitations, scan landing | Non-managers and non-admins sent home with a 303; another inviter's invitation never shows on the admin page |
| `auth.spec.ts` | Passwordless login end to end: code by email (read back from `auth_codes`), profile step with the fake Abacate customer, `next` carried through, logout, admin impersonation link | Wrong code refused; invalid CPF refused before any customer call; pending invitation accepted on first login |
| `event-management.spec.ts` | Creator builds an event through the real forms: ticket type, priced and free batches (product only for the priced one), close a batch, publish; extras and sections through the page actions | Section with extras refused; batch with sales refused; another organization's event is 404 |
| `organization.spec.ts` | Leader invites a participant who joins by the link; admin invites a new leader whose organization is born with the invitation and renamed on arrival; role change and removal from the team page | Duplicate pending invitation refused; expired and unknown links refused with their own messages; the leader row has no controls |
| `login-modal.spec.ts` | The in-page login modal on the event page: email, code and profile steps through the same actions as the auth pages, ending signed in without leaving the event | "Change email" keeps the typed address |

## Planned

One spec per remaining migration step, added by the PR that ports the flow:
`checkin` (10), `checkout` (11), `webhook` and `order-expiry` (12), `payout` (13).
The step numbers are those of the migration plan, not of `PLAN.md`.
