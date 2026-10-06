import { env } from '$env/dynamic/private';
import pg from 'pg';
import { getQueryable, type Queryable } from './queryable';

// Ecto maps `:utc_datetime` to Postgres `timestamp` WITHOUT time zone (see
// priv/repo/migrations/20260513020000_create_events.exs), so Phoenix writes UTC
// into a column that carries no zone. node-postgres would parse those strings in
// the server's local zone and silently shift every value. Appending `Z` restores
// the UTC that Ecto intended. Must run before any pool is created.
const TIMESTAMP_WITHOUT_TIME_ZONE_OID = 1114;
pg.types.setTypeParser(TIMESTAMP_WITHOUT_TIME_ZONE_OID, (value) => new Date(`${value}Z`));

/** The app's single connection pool, wrapped as a Queryable; built on first use. */
export function getQueryableInstance(): Queryable {
    postgresQueryable ??= getQueryable(getPool());
    return postgresQueryable;
}

function getPool(): pg.Pool {
    pool ??= new pg.Pool({ connectionString: getConnectionString() });
    return pool;
}

function getConnectionString(): string {
    const url = env.DATABASE_URL;
    if (url?.startsWith('postgres://') || url?.startsWith('postgresql://')) {
        return url;
    }
    throw new Error(
        `DATABASE_URL must be a postgres:// or postgresql:// connection string, got: ${url ?? '(unset)'}`
    );
}

// singletons
let pool: pg.Pool | null = null;
let postgresQueryable: Queryable | null = null;
