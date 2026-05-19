# PLAN.md — Tickets: Event Ticketing Platform

## Project Overview

**Tickets** is an event ticketing platform where creators publish events with tickets and optional add-on items, and users purchase them via Abacate Pay (Pix/Card). Authentication is passwordless (email + security code).

---

## Tech Stack

- **Frontend:** SvelteKit PWA (TypeScript)
- **Backend:** Elixir + Phoenix (REST API)
- **Database:** PostgreSQL
- **Payments:** Abacate Pay (v2 API — https://docs.abacatepay.com)

---

## Architecture

```
┌─────────────────┐       ┌──────────────────────┐       ┌────────────┐
│  SvelteKit PWA  │◄─────►│  Phoenix REST API    │◄─────►│ PostgreSQL │
│  (Frontend)     │       │  (Backend)           │       │            │
└─────────────────┘       └────────┬─────────────┘       └────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │  Abacate Pay    │
                          │  (Payments)     │
                          └─────────────────┘
```

---

## User Roles

| Role    | Can browse events | Can buy tickets | Can create/edit events | Can invite creators |
|---------|:-:|:-:|:-:|:-:|
| buyer   | ✓ | ✓ | ✗ | ✗ |
| creator | ✓ | ✓ | ✓ (own events) | ✓ |
| admin   | ✓ | ✓ | ✓ (all events) | ✓ |

- Every new user starts as `buyer`.
- A `buyer` becomes `creator` only when they accept an invitation from an existing `creator` or `admin`.

---

## Authentication Flow

1. User enters email on login screen.
2. Backend generates a 6-digit code, stores it with a 10-minute expiry, and sends it via email.
3. User enters the code on the verification screen.
4. Backend validates the code:
   - If no user exists with that email → create one with role `buyer`.
   - If a pending invitation exists for that email → set role to `creator`.
   - Return a session token (JWT or opaque token).
5. Frontend stores the token and uses it in `Authorization: Bearer <token>` headers.

---

## Abacate Pay Integration

### Key Concepts

Abacate Pay uses **Products** and **Checkouts**:

- **Product:** Represents a purchasable item (ticket type or extra item). Created via `POST /v2/products/create` with `externalId`, `name`, `price` (in centavos), and `currency: "BRL"`. Returns a `prod_*` ID.
- **Checkout:** A payment session. Created via `POST /v2/checkouts/create` with a list of product `items` (each with `id` and `quantity`). Returns a payment `url` to redirect the user.
- **Webhook:** Abacate Pay notifies our backend when payment status changes. We listen for `checkout.completed` and `checkout.refunded` events.

### Payment Flow

1. User selects tickets + extras and clicks "Buy".
2. Backend creates an `order` (status: `pending`) and reserves stock (inside a DB transaction).
3. Backend ensures each ticket type and extra item has a corresponding Abacate Pay product (create if missing, cache the `prod_*` ID).
4. Backend calls `POST /v2/checkouts/create` with the product items, `returnUrl`, and `completionUrl`.
5. Backend stores the `bill_*` ID and payment URL on the order.
6. Frontend redirects user to the Abacate Pay payment URL.
7. User pays (Pix or Card).
8. Abacate Pay sends `checkout.completed` webhook → backend marks order as `paid`.
9. User returns to `completionUrl` → frontend shows order confirmation.

### Webhook Security

- Register webhook via `POST /v2/webhooks/create` with a `secret`.
- Validate incoming webhook payloads using HMAC signature with the shared secret.
- Only process events for known `bill_*` IDs.

### Abacate Pay API Reference

- Base URL: `https://api.abacatepay.com/v2`
- Auth: `Authorization: Bearer <abacatepay-api-key>`
- Create product: `POST /v2/products/create` — body: `{ externalId, name, price, currency: "BRL" }`
- Create checkout: `POST /v2/checkouts/create` — body: `{ items: [{ id, quantity }], methods: ["PIX", "CARD"], card: { maxInstallments: 3 }, returnUrl, completionUrl }`
- Webhook events we care about: `checkout.completed`, `checkout.refunded`

---

## Database Schema

### users
| Column     | Type         | Notes                              |
|------------|--------------|-------------------------------------|
| id         | UUID (PK)    | gen_random_uuid()                   |
| email      | VARCHAR(255) | UNIQUE, NOT NULL                    |
| role       | VARCHAR(20)  | DEFAULT 'buyer'. Values: buyer, creator, admin |
| invited_by | UUID (FK)    | REFERENCES users(id), nullable      |
| created_at | TIMESTAMPTZ  | DEFAULT now()                       |
| updated_at | TIMESTAMPTZ  | DEFAULT now()                       |

### auth_codes
| Column     | Type         | Notes                              |
|------------|--------------|-------------------------------------|
| id         | UUID (PK)    |                                     |
| email      | VARCHAR(255) | NOT NULL                            |
| code       | VARCHAR(6)   | NOT NULL                            |
| expires_at | TIMESTAMPTZ  | NOT NULL (now + 10 min)             |
| used       | BOOLEAN      | DEFAULT false                       |
| created_at | TIMESTAMPTZ  | DEFAULT now()                       |

### sessions
| Column     | Type         | Notes                              |
|------------|--------------|-------------------------------------|
| id         | UUID (PK)    |                                     |
| user_id    | UUID (FK)    | REFERENCES users(id) ON DELETE CASCADE |
| token      | VARCHAR(255) | UNIQUE, NOT NULL                    |
| expires_at | TIMESTAMPTZ  | NOT NULL                            |
| created_at | TIMESTAMPTZ  | DEFAULT now()                       |

### events
| Column          | Type         | Notes                              |
|-----------------|--------------|-------------------------------------|
| id              | UUID (PK)    |                                     |
| creator_id      | UUID (FK)    | REFERENCES users(id) ON DELETE CASCADE |
| title           | VARCHAR(255) | NOT NULL                            |
| description     | TEXT         |                                     |
| location        | VARCHAR(255) |                                     |
| starts_at       | TIMESTAMPTZ  | NOT NULL                            |
| ends_at         | TIMESTAMPTZ  |                                     |
| cover_image_url | TEXT         |                                     |
| status          | VARCHAR(20)  | DEFAULT 'draft'. Values: draft, published, cancelled |
| created_at      | TIMESTAMPTZ  | DEFAULT now()                       |
| updated_at      | TIMESTAMPTZ  | DEFAULT now()                       |

### ticket_types
| Column            | Type         | Notes                              |
|-------------------|--------------|-------------------------------------|
| id                | UUID (PK)    |                                     |
| event_id          | UUID (FK)    | REFERENCES events(id) ON DELETE CASCADE |
| name              | VARCHAR(255) | NOT NULL                            |
| description       | TEXT         |                                     |
| price_cents       | INTEGER      | NOT NULL                            |
| quantity_total    | INTEGER      | NOT NULL                            |
| quantity_sold     | INTEGER      | DEFAULT 0                           |
| sales_start       | TIMESTAMPTZ  |                                     |
| sales_end         | TIMESTAMPTZ  |                                     |
| abacate_product_id| VARCHAR(255) | Cached prod_* ID from Abacate Pay   |
| created_at        | TIMESTAMPTZ  | DEFAULT now()                       |

### extra_items
| Column            | Type         | Notes                              |
|-------------------|--------------|-------------------------------------|
| id                | UUID (PK)    |                                     |
| event_id          | UUID (FK)    | REFERENCES events(id) ON DELETE CASCADE |
| name              | VARCHAR(255) | NOT NULL                            |
| description       | TEXT         |                                     |
| price_cents       | INTEGER      | NOT NULL                            |
| quantity_total    | INTEGER      | Nullable (unlimited if null)        |
| quantity_sold     | INTEGER      | DEFAULT 0                           |
| abacate_product_id| VARCHAR(255) | Cached prod_* ID from Abacate Pay   |
| created_at        | TIMESTAMPTZ  | DEFAULT now()                       |

### orders
| Column              | Type         | Notes                              |
|---------------------|--------------|-------------------------------------|
| id                  | UUID (PK)    |                                     |
| user_id             | UUID (FK)    | REFERENCES users(id)               |
| event_id            | UUID (FK)    | REFERENCES events(id)              |
| status              | VARCHAR(20)  | DEFAULT 'pending'. Values: pending, paid, expired, refunded |
| total_cents         | INTEGER      | NOT NULL                            |
| abacate_checkout_id | VARCHAR(255) | bill_* ID from Abacate Pay          |
| abacate_payment_url | TEXT         | Payment URL for redirect            |
| paid_at             | TIMESTAMPTZ  |                                     |
| created_at          | TIMESTAMPTZ  | DEFAULT now()                       |
| updated_at          | TIMESTAMPTZ  | DEFAULT now()                       |

### order_items
| Column          | Type         | Notes                              |
|-----------------|--------------|-------------------------------------|
| id              | UUID (PK)    |                                     |
| order_id        | UUID (FK)    | REFERENCES orders(id) ON DELETE CASCADE |
| item_type       | VARCHAR(20)  | NOT NULL. Values: ticket, extra     |
| item_id         | UUID         | NOT NULL (ticket_type_id or extra_item_id) |
| quantity        | INTEGER      | NOT NULL, DEFAULT 1                 |
| unit_price_cents| INTEGER      | NOT NULL                            |
| created_at      | TIMESTAMPTZ  | DEFAULT now()                       |

### invitations
| Column     | Type         | Notes                              |
|------------|--------------|-------------------------------------|
| id         | UUID (PK)    |                                     |
| inviter_id | UUID (FK)    | REFERENCES users(id)               |
| email      | VARCHAR(255) | NOT NULL                            |
| status     | VARCHAR(20)  | DEFAULT 'pending'. Values: pending, accepted |
| created_at | TIMESTAMPTZ  | DEFAULT now()                       |

---

## API Endpoints (Backend)

### Auth (public)
- `POST /api/v1/auth/request-code` — Send security code to email
- `POST /api/v1/auth/verify-code` — Verify code, create/find user, return token
- `DELETE /api/v1/auth/logout` — Invalidate session

### User (authenticated)
- `GET /api/v1/me` — Get current user profile

### Events (authenticated)
- `GET /api/v1/events` — List published events (public-ish, but requires auth)
- `GET /api/v1/events/:id` — Get event details with ticket types and extras
- `POST /api/v1/events` — Create event (creator only)
- `PUT /api/v1/events/:id` — Update event (creator/owner only)
- `DELETE /api/v1/events/:id` — Delete event (creator/owner only)

### Ticket Types (authenticated, creator/owner only)
- `POST /api/v1/events/:event_id/ticket-types` — Create ticket type
- `PUT /api/v1/ticket-types/:id` — Update ticket type
- `DELETE /api/v1/ticket-types/:id` — Delete ticket type

### Extra Items (authenticated, creator/owner only)
- `POST /api/v1/events/:event_id/extras` — Create extra item
- `PUT /api/v1/extras/:id` — Update extra item
- `DELETE /api/v1/extras/:id` — Delete extra item

### Orders (authenticated)
- `POST /api/v1/orders` — Create order (validates stock, calls Abacate Pay, returns payment URL)
- `GET /api/v1/orders` — List current user's orders
- `GET /api/v1/orders/:id` — Get order details

### Invitations (authenticated, creator/admin only)
- `POST /api/v1/invitations` — Invite a user by email to become creator
- `GET /api/v1/invitations` — List sent invitations

### Webhooks (no auth — validated by HMAC signature)
- `POST /webhooks/abacate-pay` — Receive payment notifications from Abacate Pay

---

## Frontend Routes (SvelteKit)

```
src/routes/
├── +layout.svelte                  # Global layout: nav bar, auth state provider
├── +page.svelte                    # Home: event listing (cards grid)
├── auth/
│   ├── login/+page.svelte          # Email input form
│   └── verify/+page.svelte         # 6-digit code input form
├── events/
│   ├── [id]/
│   │   ├── +page.svelte            # Event detail: info + ticket/extras selection + buy button
│   │   └── edit/+page.svelte       # Edit event form (creator only)
│   └── new/+page.svelte            # Create event form (creator only)
├── orders/
│   ├── +page.svelte                # My orders list
│   └── [id]/+page.svelte           # Order detail: status, items, payment link if pending
├── admin/
│   └── invitations/+page.svelte    # Send invitations, view invitation status
└── profile/+page.svelte            # User profile (email, role)
```

---

## Frontend Mock Strategy (Phase 1)

Use SvelteKit's own `+server.ts` files to create a fake REST API that mirrors the real backend contract:

### How it works
- Create `src/routes/api/v1/[...path]/+server.ts` handlers that match every backend endpoint.
- Store data in-memory using a simple module-level store (Map/Object). Optionally persist to `localStorage` via a SvelteKit hook for session survival during development.
- Auth mock: always accept any 6-digit code, return a fake token.
- Payment mock: return a fake Abacate Pay URL that redirects back to the completion page after 3 seconds (simulating payment).
- The mock API returns the exact same JSON shapes documented in the API Endpoints section above.

### Why this approach
- Zero extra dependencies (no MSW, no json-server).
- The mock routes serve as living API documentation.
- Swapping to the real backend = changing one environment variable (`PUBLIC_API_URL`).
- The prototype is fully deployable and shareable with stakeholders.

### Mock data seed
- Pre-populate 3-5 sample events with ticket types and extras so the UI is never empty on first load.

---

## Development Phases

### Phase 1 — Frontend Prototype (SvelteKit PWA + Mocked Backend)

**Goal:** Build and validate the complete UI/UX before writing any backend code.

**Tasks:**
1. Scaffold SvelteKit project with TypeScript.
2. Configure PWA (vite-plugin-pwa or @vite-pwa/sveltekit): manifest, service worker, icons.
3. Set up global layout: navigation bar (logo, events link, my orders, profile/login).
4. Build auth pages:
   - Login page: email input + "Send code" button.
   - Verify page: 6-digit code input + "Verify" button.
   - Auth state management (Svelte store with token + user info).
   - Protected route logic (redirect to login if unauthenticated).
5. Build event listing page:
   - Grid/list of event cards (cover image, title, date, location, price range).
   - Search/filter bar (optional, nice-to-have).
6. Build event detail page:
   - Event info section (cover, title, description, date, location).
   - Ticket type selector (name, price, quantity picker, available count).
   - Extra items selector (name, price, quantity picker).
   - Order summary sidebar/bottom bar (total, "Buy" button).
7. Build event creation/editing pages (creator only):
   - Event form: title, description, location, dates, cover image URL.
   - Ticket types sub-form: add/remove ticket types with name, price, quantity.
   - Extra items sub-form: add/remove extras with name, price, quantity.
   - Publish/draft toggle.
8. Build checkout/order flow:
   - "Buy" button creates a mock order and redirects to a fake payment page.
   - Fake payment page simulates success after a few seconds.
   - Redirect to order confirmation page.
9. Build orders pages:
   - My orders list (status badges: pending, paid, expired, refunded).
   - Order detail (items breakdown, total, status, payment link if pending).
10. Build invitation management page (creator only):
    - Email input + "Send invitation" button.
    - List of sent invitations with status.
11. Build profile page:
    - Display email and role.
    - Logout button.
12. Implement mock API (`+server.ts` routes):
    - All endpoints from the API Endpoints section.
    - In-memory data store with seed data.
    - Fake auth (accept any code).
    - Fake payment redirect flow.
13. Responsive design: mobile-first, works well as installed PWA.
14. Deploy prototype for stakeholder review.

**Deliverable:** A fully navigable, installable PWA prototype with all screens and flows working against mocked data.

---

### Phase 2 — Database & Auth (Phoenix + PostgreSQL)

**Goal:** Set up the real backend with working authentication.

**Tasks:**
1. Scaffold Phoenix project (`--no-html --no-assets --database postgres`).
2. Add dependencies: `swoosh` (email), `req` (HTTP client), `corsica` (CORS), `guardian` or custom token auth.
3. Create Ecto migrations for all tables (users, auth_codes, sessions).
4. Implement `Accounts` context:
   - `request_code(email)` — generate 6-digit code, store with expiry, send email.
   - `verify_code(email, code)` — validate code, find/create user, check invitations, create session.
   - `logout(token)` — delete session.
   - `get_user_by_token(token)` — session lookup for auth plug.
5. Implement auth plug/middleware for protected routes.
6. Configure email sending (Swoosh with SMTP or a provider like Resend/Mailgun).
7. Set up CORS to allow the SvelteKit frontend origin.
8. Connect frontend to real auth endpoints (swap mock auth routes).

---

### Phase 3 — Events & Inventory

**Goal:** Real CRUD for events, ticket types, and extra items.

**Tasks:**
1. Create Ecto migrations for events, ticket_types, extra_items tables.
2. Implement `Events` context:
   - CRUD for events (scoped to creator).
   - CRUD for ticket types (nested under events).
   - CRUD for extra items (nested under events).
   - Authorization checks (only owner/admin can modify).
3. Implement controllers and JSON views for all event endpoints.
4. Connect frontend to real event endpoints.

---

### Phase 4 — Payments & Orders

**Goal:** Real checkout flow with Abacate Pay.

**Tasks:**
1. Create Ecto migrations for orders, order_items tables.
2. Implement `Payments` context (Abacate Pay client):
   - `create_product(name, price_cents, external_id)` — calls `POST /v2/products/create`.
   - `create_checkout(order)` — calls `POST /v2/checkouts/create` with product items.
   - `handle_webhook(payload)` — validates HMAC, processes `checkout.completed` / `checkout.refunded`.
3. Implement `Orders` context:
   - `create_order(user, event, items)` — validate stock, reserve quantities (DB transaction), call Abacate Pay, return payment URL.
   - `list_orders(user)` — user's order history.
   - `get_order(user, order_id)` — order detail with items.
4. Implement webhook endpoint (`POST /webhooks/abacate-pay`):
   - Validate HMAC signature.
   - Update order status to `paid` or `refunded`.
   - Update `quantity_sold` on ticket types and extra items.
5. Register webhook with Abacate Pay (via API or dashboard).
6. Handle expired/abandoned orders: background job or periodic task to release reserved stock after timeout.
7. Connect frontend to real order/checkout endpoints.

---

### Phase 5 — Invitations & Email

**Goal:** Creator invitation system and transactional emails.

**Tasks:**
1. Create Ecto migration for invitations table.
2. Implement invitation logic in `Accounts` context:
   - `create_invitation(inviter, email)` — create invitation, send email notification.
   - `list_invitations(inviter)` — inviter's sent invitations.
   - Auto-upgrade role on `verify_code` if pending invitation exists.
3. Implement transactional emails:
   - Auth code email.
   - Invitation email.
   - Order confirmation email (on `checkout.completed` webhook).
4. Connect frontend to real invitation endpoints.

---

### Phase 6 — Testing, Polish & Deploy

**Goal:** Production-ready application.

**Tasks:**
1. Backend tests (ExUnit):
   - Unit tests for all context modules.
   - Integration tests for auth flow.
   - Integration tests for order/payment flow (mock Abacate Pay HTTP calls).
   - Webhook handling tests.
2. Frontend polish:
   - Error handling (API errors, network failures, stock exhaustion).
   - Loading states and skeleton screens.
   - Offline PWA behavior (cache event listing, show offline indicator).
   - Form validation (email format, required fields, quantity limits).
3. Security review:
   - Rate limiting on auth code requests.
   - HMAC validation on webhooks.
   - Input sanitization.
   - CORS configuration for production domain.
4. Deploy:
   - Backend: Fly.io or Railway (with managed PostgreSQL).
   - Frontend: Vercel or Cloudflare Pages.
   - Environment variables: API keys, SMTP credentials, database URL, frontend URL.
   - Set up Abacate Pay webhook pointing to production URL.
5. Remove mock API routes from frontend (or gate behind `dev` flag).

---

## Environment Variables

### Backend (.env)
- `DATABASE_URL` — PostgreSQL connection string
- `SECRET_KEY_BASE` — Phoenix secret
- `ABACATE_PAY_API_KEY` — Abacate Pay Bearer token
- `ABACATE_PAY_WEBHOOK_SECRET` — Shared secret for HMAC validation
- `MAIL_FROM` — Sender email address
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` — Email provider credentials
- `FRONTEND_URL` — SvelteKit app URL (for CORS and email links)

### Frontend (.env)
- `PUBLIC_API_URL` — Backend API base URL (e.g., `http://localhost:4000/api/v1` or mock)
- `VITE_APP_NAME` — "Tickets"

---

## Key Design Decisions

1. **Passwordless auth only** — No passwords to store, no reset flows. Simple and secure.
2. **Abacate Pay Products as source of truth for pricing** — Each ticket type and extra item maps to an Abacate Pay product. We cache the `prod_*` ID locally to avoid re-creating products on every checkout.
3. **Stock reservation in DB transaction** — `quantity_sold` is incremented atomically when an order is created, not when payment completes. If payment doesn't complete within a timeout, a background job releases the stock.
4. **Frontend-first development** — Validate UX before building backend. Mock API uses the same contract so the switch is seamless.
5. **Roles are simple** — Only 3 roles, no complex permission trees. Role upgrade happens only via invitation.
