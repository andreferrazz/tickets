import pg from 'pg';
import { E2E_DATABASE_URL } from './database';

/**
 * One value straight from the e2e database, for asserting what a flow
 * persisted when the page does not show it (product ids, timestamps, roles).
 *
 * @example
 * await queryValue<string>('select role from users where email = $1', [email]);
 */
export async function queryValue<T>(sql: string, params: unknown[]): Promise<T | null> {
    const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    try {
        const { rows } = await client.query<{ value: T }>(`select (${sql}) as value`, params);
        return rows[0]?.value ?? null;
    } finally {
        await client.end();
    }
}

/** Runs a statement that returns nothing, for the rare setup a flow cannot do itself. */
export async function execute(sql: string, params: unknown[]): Promise<void> {
    const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    try {
        await client.query(sql, params);
    } finally {
        await client.end();
    }
}
