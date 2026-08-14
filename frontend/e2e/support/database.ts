import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import {
    ADMIN,
    DRAFT_ORG,
    MEMBER,
    OTHER_ORG,
    SEEDED_BATCHES,
    SEEDED_EVENTS,
    SEEDED_TICKET_TYPES,
    SESSIONS
} from './fixtures';

const run = promisify(execFile);

/**
 * The database the e2e run owns outright. Kept separate from `backend_dev` so a
 * run can truncate freely without touching whatever you were working on.
 */
export const E2E_DATABASE = 'tickets_e2e';
export const E2E_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${E2E_DATABASE}`;

const ADMIN_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const SCHEMA_SOURCE = 'backend_dev';

// Only the tables these specs read. Truncating the whole schema would also wipe
// schema_migrations and make the copied schema look unmigrated.
const SEEDED_TABLES = [
    'sessions',
    'ticket_batches',
    'ticket_types',
    'events',
    'organization_memberships',
    'organizations',
    'users'
];

/**
 * Creates the e2e database if it is missing and copies the schema across from
 * the migrated dev database.
 *
 * The schema is copied rather than hand-written on purpose: the column types
 * carry real weight here. `starts_at` is `timestamp(0) WITHOUT time zone`, which
 * is exactly the case the UTC type parser in `$lib/db/pool` exists to handle, so
 * a hand-rolled DDL that got it wrong would let a real bug pass.
 */
async function ensureDatabase(): Promise<void> {
    await createDatabaseIfMissing();
    // Checks for the schema rather than just the database: a run that died
    // between `create database` and the schema copy would otherwise leave an
    // empty database behind that every later run would accept as ready.
    if (await hasSchema()) return;
    await copySchema();
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

async function hasSchema(): Promise<boolean> {
    const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    try {
        const { rows } = await client.query<{ present: string | null }>(
            `select to_regclass('public.events')::text as present`
        );
        return rows[0]?.present !== null;
    } finally {
        await client.end();
    }
}

// Piped through psql rather than executed over the `pg` driver: pg_dump emits
// psql meta-commands (\restrict and friends on PG 18) that the driver rejects.
async function copySchema(): Promise<void> {
    const dump = `pg_dump --schema-only --no-owner --no-privileges -h localhost -U postgres ${SCHEMA_SOURCE}`;
    const load = `psql --quiet -v ON_ERROR_STOP=1 -h localhost -U postgres -d ${E2E_DATABASE}`;
    await run('bash', ['-o', 'pipefail', '-c', `${dump} | ${load}`], {
        env: { ...process.env, PGPASSWORD: 'postgres' },
        maxBuffer: 32 * 1024 * 1024
    });
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
            `insert into users (id, email, role, name, cellphone, tax_id, inserted_at, updated_at)
			 values ($1, $2, $3, 'E2E User', '11999999999', '39053344705',
			         now() at time zone 'utc', now() at time zone 'utc')`,
            [user.id, user.email, user.role]
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
			 values ($1, $2, $3, $4, $5, 0, now() at time zone 'utc')`,
            [batch.id, batch.ticketTypeId, batch.sequence, batch.priceCents, batch.quantityTotal]
        );
    }
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
