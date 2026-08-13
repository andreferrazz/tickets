import { env } from '$env/dynamic/private';
import pg from 'pg';
import type { Queryable } from './queryable';

const TIMESTAMP_WITHOUT_TIME_ZONE_OID = 1114;

// Ecto maps `:utc_datetime` to Postgres `timestamp` WITHOUT time zone (see
// priv/repo/migrations/20260513020000_create_events.exs), so Phoenix writes UTC
// into a column that carries no zone. node-postgres would parse those strings in
// the server's local zone and silently shift every value. Appending `Z` restores
// the UTC that Ecto intended. Must run before any pool is created.
pg.types.setTypeParser(TIMESTAMP_WITHOUT_TIME_ZONE_OID, (value) => new Date(`${value}Z`));

/** Adapts a `pg.Pool` to the {@link Queryable} interface this project owns. */
export class PgPoolQueryable implements Queryable {
	constructor(private readonly pool: pg.Pool) {}

	async query<Row>(sql: string, params: readonly unknown[] = []): Promise<Row[]> {
		// Cast here rather than constraining Row to pg's QueryResultRow, which
		// would put the driver's types back into the interface this wrapper exists
		// to keep driver-free.
		const result = await this.pool.query(sql, params as unknown[]);
		return result.rows as Row[];
	}
}

let queryable: Queryable | null = null;

function connectionString(): string {
	const url = env.DATABASE_URL;
	if (url?.startsWith('postgres://') || url?.startsWith('postgresql://')) return url;
	throw new Error(
		`DATABASE_URL must be a postgres:// or postgresql:// connection string, got: ${url ?? '(unset)'}`
	);
}

/**
 * The process-wide database handle. A connection pool is a process resource, so
 * it is created once here. Nothing outside this module should call it directly —
 * the composition root in `$lib/container` is what hands it to repositories.
 */
export function db(): Queryable {
	queryable ??= new PgPoolQueryable(new pg.Pool({ connectionString: connectionString() }));
	return queryable;
}

/**
 * A {@link Queryable} that resolves the pool on first query instead of when it is
 * constructed.
 *
 * The container is built for every request, including the many routes that are
 * still client-rendered against Phoenix and touch no database. Resolving the pool
 * eagerly would turn a bad DATABASE_URL into a 500 on all of them; deferring it
 * lets the failure surface as a rejected query on the routes that actually read,
 * where it is already caught and degraded.
 *
 * @example
 * const container = createContainer({ queryable: deferredQueryable() });
 */
export function deferredQueryable(): Queryable {
	return {
		query: (sql, params) => db().query(sql, params)
	};
}
