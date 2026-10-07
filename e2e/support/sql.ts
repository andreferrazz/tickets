import pg from 'pg';
import { E2E_DATABASE_URL } from './database';

async function withClient<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
    const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    try {
        return await work(client);
    } finally {
        await client.end();
    }
}

/** The rows a statement returns, for seeding helpers that need generated ids back. */
export function queryRows<Row extends pg.QueryResultRow>(
    sql: string,
    params: unknown[]
): Promise<Row[]> {
    return withClient(async (client) => (await client.query<Row>(sql, params)).rows);
}

/**
 * One value straight from the e2e database, for asserting what a flow
 * persisted when the page does not show it (product ids, timestamps, roles).
 * `sql` is a scalar select; it is wrapped so a missing row reads as null.
 *
 * @example
 * await queryValue<string>('select role from users where email = $1', [email]);
 */
export async function queryValue<T>(sql: string, params: unknown[]): Promise<T | null> {
    const rows = await queryRows<{ value: T }>(`select (${sql}) as value`, params);
    return rows[0]?.value ?? null;
}

/** Runs a statement that returns nothing, for the rare setup a flow cannot do itself. */
export async function execute(sql: string, params: unknown[]): Promise<void> {
    await queryRows(sql, params);
}
