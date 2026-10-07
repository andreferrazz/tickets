import { env } from '$env/dynamic/private';
import pg from 'pg';
import { getQueryable, type Queryable } from './queryable';

// Ecto mapped `:utc_datetime` to Postgres `timestamp` WITHOUT time zone (the
// columns are in db/migrations/0001_baseline.sql), so every row holds UTC in a
// column that carries no zone, and this app writes them the same way. node-postgres would parse those strings in
// the server's local zone and silently shift every value. Appending `Z` restores
// the UTC that was intended. Must run before any pool is created.
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
        // Only the scheme is echoed: the rest of the value holds the password.
        `DATABASE_URL must be a postgres:// or postgresql:// connection string, got scheme: ${url ? url.split('://')[0] : '(unset)'}`
    );
}

// singletons
let pool: pg.Pool | null = null;
let postgresQueryable: Queryable | null = null;
