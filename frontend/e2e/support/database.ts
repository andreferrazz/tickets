import pg from 'pg';
import { migrate } from '../../db/migrate.ts';
import {
    ADMIN,
    MEMBER_PAID_ORDER,
    PENDING_INVITATION,
    PUBLISHED_BATCH,
    PUBLISHED_TICKET_TYPE,
    DRAFT_ORG,
    MEMBER,
    OTHER_ORG,
    SEEDED_BATCHES,
    SEEDED_EVENTS,
    SEEDED_ORDER_ITEMS,
    SEEDED_ORDERS,
    SEEDED_PASSES,
    SEEDED_TICKET_TYPES,
    SESSIONS
} from './fixtures';

/**
 * The database the e2e run owns outright. Kept separate from `backend_dev` so a
 * run can truncate freely without touching whatever you were working on.
 */
export const E2E_DATABASE = 'tickets_e2e';

// Honours the libpq variables so a machine whose 5432 belongs to another project
// can point the run at a different Postgres without editing this file.
const PG_HOST = process.env.PGHOST ?? 'localhost';
const PG_PORT = process.env.PGPORT ?? '5432';
const PG_AUTH = 'postgres:postgres';

export const E2E_DATABASE_URL = `postgres://${PG_AUTH}@${PG_HOST}:${PG_PORT}/${E2E_DATABASE}`;

const ADMIN_URL = `postgres://${PG_AUTH}@${PG_HOST}:${PG_PORT}/postgres`;

// Only the tables these specs read. Truncating the whole schema would also wipe
// the migration bookkeeping and make the database look unmigrated.
const SEEDED_TABLES = [
    'invitations',
    'passes',
    'order_items',
    'orders',
    'sessions',
    'ticket_batches',
    'ticket_types',
    'events',
    'organization_memberships',
    'organizations',
    'users'
];

/**
 * Creates the e2e database if it is missing and brings it to the current schema
 * with the same SQL files production runs (`db/migrations`), so a spec can only
 * pass against the schema that will actually be deployed.
 */
async function ensureDatabase(): Promise<void> {
    await createDatabaseIfMissing();
    await migrate({ connectionString: E2E_DATABASE_URL });
}

async function createDatabaseIfMissing(): Promise<void> {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    try {
        const { rows } = await admin.query('select 1 from pg_database where datname = $1', [
            E2E_DATABASE
        ]);
        if (rows.length === 0) await admin.query(`create database ${E2E_DATABASE}`);
    } finally {
        await admin.end();
    }
}

/** Empties the seeded tables and inserts the fixture rows the specs assert on. */
async function seed(): Promise<void> {
    const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    try {
        await client.query(`truncate table ${SEEDED_TABLES.join(', ')} cascade`);
        await insertOrganizations(client);
        await insertUsers(client);
        await insertEvents(client);
        await insertTickets(client);
        await insertOrders(client);
        await insertInvitations(client);
        await insertSessions(client);
    } finally {
        await client.end();
    }
}

async function insertOrganizations(client: pg.Client): Promise<void> {
    for (const org of [DRAFT_ORG, OTHER_ORG]) {
        await client.query(
            `insert into organizations (id, name, inserted_at, updated_at)
			 values ($1, $2, now() at time zone 'utc', now() at time zone 'utc')`,
            [org.id, org.name]
        );
    }
}

async function insertUsers(client: pg.Client): Promise<void> {
    for (const user of [MEMBER, ADMIN]) {
        // No profile_complete column: Phoenix derives that flag from name/cellphone/
        // tax_id when it serialises a user.
        await client.query(
            `insert into users (id, email, role, name, cellphone, tax_id, abacate_customer_id, inserted_at, updated_at)
			 values ($1, $2, $3, 'E2E User', '11999999999', '39053344705', $4,
			         now() at time zone 'utc', now() at time zone 'utc')`,
            [user.id, user.email, user.role, `cust_e2e_${user.role}`]
        );
    }
    // Only MEMBER belongs to an org; ADMIN deliberately belongs to none, so the
    // admin spec proves role-based access rather than membership.
    await client.query(
        `insert into organization_memberships (id, organization_id, user_id, role, inserted_at, updated_at)
		 values (gen_random_uuid(), $1, $2, 'leader', now() at time zone 'utc', now() at time zone 'utc')`,
        [DRAFT_ORG.id, MEMBER.id]
    );
}

async function insertEvents(client: pg.Client): Promise<void> {
    for (const event of SEEDED_EVENTS) {
        await client.query(
            `insert into events
			   (id, title, description, location, starts_at, status, organization_id,
			    created_by_id, inserted_at, updated_at)
			 values ($1, $2, 'seeded by the e2e run', 'Sao Paulo', $3, $4, $5, $6,
			         now() at time zone 'utc', now() at time zone 'utc')`,
            [event.id, event.title, event.startsAt, event.status, event.organizationId, MEMBER.id]
        );
    }
}

// What the seeded events sell: the event page specs assert the ticket type and
// its open batch reach the served HTML.
async function insertTickets(client: pg.Client): Promise<void> {
    for (const ticketType of SEEDED_TICKET_TYPES) {
        await client.query(
            `insert into ticket_types (id, event_id, name, description, inserted_at)
			 values ($1, $2, $3, 'seeded by the e2e run', now() at time zone 'utc')`,
            [ticketType.id, ticketType.eventId, ticketType.name]
        );
    }
    for (const batch of SEEDED_BATCHES) {
        await client.query(
            `insert into ticket_batches
			   (id, ticket_type_id, sequence, price_cents, quantity_total, quantity_sold, inserted_at)
			 values ($1, $2, $3, $4, $5, $6, now() at time zone 'utc')`,
            [
                batch.id,
                batch.ticketTypeId,
                batch.sequence,
                batch.priceCents,
                batch.quantityTotal,
                batch.quantitySold
            ]
        );
    }
}

// Orders with their items and passes, so the buyer pages have something to
// render: a paid order with two passes, a pending one, and another buyer's.
async function insertOrders(client: pg.Client): Promise<void> {
    for (const order of SEEDED_ORDERS) {
        await client.query(
            `insert into orders
               (id, user_id, event_id, status, total_cents, abacate_payment_url, paid_at,
                inserted_at, updated_at)
             values ($1, $2, $3, $4, $5, $6, $7, now() at time zone 'utc', now() at time zone 'utc')`,
            [
                order.id,
                order.userId,
                order.eventId,
                order.status,
                order.totalCents,
                order.paymentUrl,
                order.paidAt
            ]
        );
    }
    for (const item of SEEDED_ORDER_ITEMS) {
        await client.query(
            `insert into order_items
               (id, order_id, item_type, item_id, batch_id, item_name, quantity, unit_price_cents, inserted_at)
             values ($1, $2, 'ticket', $3, $4, $5, $6, $7, now() at time zone 'utc')`,
            [
                item.id,
                item.orderId,
                item.itemId,
                item.batchId,
                item.itemName,
                item.quantity,
                item.unitPriceCents
            ]
        );
    }
    for (const pass of SEEDED_PASSES) {
        await client.query(
            `insert into passes
               (id, token, kind, order_id, order_item_id, event_id, user_id, item_name, checked_in_at,
                inserted_at, updated_at)
             values ($1, $2, 'ticket', $3, $4, $5, $6, $7, $8, now() at time zone 'utc', now() at time zone 'utc')`,
            [
                pass.id,
                pass.token,
                pass.orderId,
                pass.orderItemId,
                MEMBER_PAID_ORDER.eventId,
                MEMBER_PAID_ORDER.userId,
                PUBLISHED_TICKET_TYPE.name,
                pass.checkedInAt
            ]
        );
    }
}

async function insertInvitations(client: pg.Client): Promise<void> {
    await client.query(
        `insert into invitations
           (id, inviter_id, organization_id, email, role, status, token, expires_at, inserted_at)
         values ($1, $2, $3, $4, $5, 'pending', $6, (now() at time zone 'utc') + interval '7 days',
                 now() at time zone 'utc')`,
        [
            PENDING_INVITATION.id,
            PENDING_INVITATION.inviterId,
            PENDING_INVITATION.organizationId,
            PENDING_INVITATION.email,
            PENDING_INVITATION.role,
            PENDING_INVITATION.token
        ]
    );
}

async function insertSessions(client: pg.Client): Promise<void> {
    for (const session of SESSIONS) {
        await client.query(
            `insert into sessions (id, user_id, token, expires_at, inserted_at)
			 values (gen_random_uuid(), $1, $2, (now() at time zone 'utc') + interval '1 day',
			         now() at time zone 'utc')`,
            [session.userId, session.token]
        );
    }
}

/** Playwright globalSetup: bring the e2e database up and load a known world. */
export default async function prepareDatabase(): Promise<void> {
    await ensureDatabase();
    await seed();
}
