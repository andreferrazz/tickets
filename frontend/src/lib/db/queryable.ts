import { env } from '$env/dynamic/private';
import pg from 'pg'

// Ecto maps `:utc_datetime` to Postgres `timestamp` WITHOUT time zone (see
// priv/repo/migrations/20260513020000_create_events.exs), so Phoenix writes UTC
// into a column that carries no zone. node-postgres would parse those strings in
// the server's local zone and silently shift every value. Appending `Z` restores
// the UTC that Ecto intended. Must run before any pool is created.
const TIMESTAMP_WITHOUT_TIME_ZONE_OID = 1114;
pg.types.setTypeParser(TIMESTAMP_WITHOUT_TIME_ZONE_OID, (value) => new Date(`${value}Z`));

/**
 * The database interface this project owns. Repositories depend on this.
 *
 * @example
 * const queryable = getQueryableInstance();
 * const rows = await queryable.query<{ id: string }>('SELECT id FROM events WHERE status = $1', ['published']);
 */
export interface Queryable {
	query<Row>(sql: string, params?: readonly unknown[]): Promise<Row[]>;
}

export function getQueryableInstance(): Queryable {
	postgresQueryable ??= {
		async query<Row>(sql: string, params: readonly unknown[] = []): Promise<Row[]> {
			const result = await getPool().query(sql, params as unknown[]);
			return result.rows as Row[];
		}
	}
	return postgresQueryable;
}

function getPool() {
	pool ??= new pg.Pool({ connectionString: getConnectionString() });
	return pool;
}

function getConnectionString(): string {
	const url = env.DATABASE_URL;
	
	if (url?.startsWith('postgres://') || url?.startsWith('postgresql://')) {
		return url;
	};

	throw new Error(`DATABASE_URL must be a postgres:// or postgresql:// connection string, got: ${url ?? '(unset)'}`);
}

// singletons
let pool: pg.Pool | null = null
let postgresQueryable: Queryable | null = null;
