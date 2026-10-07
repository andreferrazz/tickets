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
5. Specs are F.I.R.S.T.: fast (seconds) and independent. The seeded fixtures are
   read-only: a spec that needs to change a person, a session or an invitation
   creates its own (`support/unique.ts`, `support/people.ts`), so the suite passes
   in any order, with any number of workers, and when repeated or retried.
6. Follow the mail, not the row. Login codes and invitation links are read from
   the fake mailer through `/e2e-fakes/outbox` (`support/outbox.ts`), which
   exists only under `INTEGRATIONS=fake`. Database reads are for facts a page
   does not show.
7. "Server-rendered" is asserted on markup with the scripts removed
   (`support/html.ts`): SvelteKit serialises load data into a script tag, so the
   raw HTML proves nothing about rendering. Leak checks use the raw HTML.

## Running

```
cd frontend && npm test          # Postgres on localhost:5432
PGPORT=55432 npm test            # a Postgres on another port (PGHOST works too)
npx playwright test --workers=1  # the order-independence check
```

Needs only a reachable Postgres: the schema comes from `frontend/db/migrations`,
the same files `npm run db:migrate` applies everywhere else.

## Catalog

| Spec | Flow covered | Edge cases |
| --- | --- | --- |
| `home.spec.ts` | Event list by role: anonymous sees published only, a member sees own-org drafts, an admin sees every draft. Closed filter and search applied server-side | Served HTML never leaks drafts |
| `event-detail.spec.ts` | Event page server-rendered with ticket type and batch; draft visibility by role | Missing, malformed and other-org draft ids are 404, never 403 |
| `orders.spec.ts` | Buyer's order list and order detail server-rendered: items, total, one QR per pass, payment link while pending; anonymous sent to login with `next` | Another buyer's order, missing and malformed ids are 404, never 403; a missing order shows the app's own error page |
| `dashboard.spec.ts` | Creator dashboard and event orders server-rendered: revenue, stock, recent orders, buyers of an item from the `buyers` query parameter, validated counts | Another organization's event is 404 for a manager, 200 for an admin; anonymous sent to login with `next` |
| `management.spec.ts` | Organization team page (members, invitations), admin users, admin invitations, scan landing | Non-managers and non-admins sent home with a 303; another inviter's invitation never shows on the admin page |
| `auth.spec.ts` | Passwordless login end to end through the real forms and the emailed code; profile step with the fake Abacate customer; `next` carried through; logout; admin copies a single-use impersonation link | Wrong code refused; guesses cut off after five; invalid CPF refused before any customer call; pending invitation accepted on first login; hostile `next` lands on `/`; a session token is not a link; a used link is dead |
| `event-management.spec.ts` | Creator builds an event through the real forms: ticket type, priced and free batches (product only for the priced one), close a batch, publish; extras and sections through the page actions | Section with extras refused; batch with sales refused; another organization's event is 404; a buyer who manages an organization cannot create |
| `organization.spec.ts` | Leader invites a participant who joins from the emailed link; admin invites a new leader whose organization is born with the invitation and renamed on arrival; role change and removal from the team page | A GET of the link leaves it pending; used, expired and unknown links refused with their own messages; duplicate pending invitation refused; the leader row has no controls |
| `login-modal.spec.ts` | The in-page login modal on the event page: email, code and profile steps through the same actions as the auth pages, ending signed in without leaving the event | "Change email" keeps the typed address |

## Planned

One spec per remaining migration step, added by the PR that ports the flow:
`checkin` (10), `checkout` (11), `webhook` and `order-expiry` (12), `payout` (13).
The step numbers are those of the migration plan, not of `PLAN.md`.
