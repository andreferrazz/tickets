import type { Pool, PoolClient } from 'pg';

/**
 * The database interface this project owns. Repositories depend on this.
 *
 * `transaction` runs `work` inside one BEGIN/COMMIT. The Queryable handed to
 * `work` is bound to that connection, so everything it queries belongs to the
 * transaction; a throw rolls back and is rethrown.
 *
 * @example
 * const rows = await queryable.query<{ id: string }>('SELECT id FROM events WHERE status = $1', ['published']);
 * const order = await queryable.transaction(async (tx) => {
 *     await tx.query('UPDATE ticket_batches SET quantity_sold = quantity_sold + $1 WHERE id = $2', [qty, batchId]);
 *     return tx.query<OrderRow>('INSERT INTO orders (...) VALUES (...) RETURNING *', [...]);
 * });
 */
export interface Queryable {
    query<Row>(sql: string, params?: readonly unknown[]): Promise<Row[]>;
    transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
}

/**
 * The pool-backed implementation. `pool.ts` builds the one the app uses; a test
 * can hand in its own pool.
 */
export function getQueryable(pool: Pool): Queryable {
    return {
        async query<Row>(sql: string, params: readonly unknown[] = []): Promise<Row[]> {
            const result = await pool.query(sql, params as unknown[]);
            return result.rows as Row[];
        },
        async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
            const client = await pool.connect();
            try {
                return await runInTransaction(client, work);
            } finally {
                client.release();
            }
        }
    };
}

async function runInTransaction<T>(
    client: PoolClient,
    work: (tx: Queryable) => Promise<T>
): Promise<T> {
    await client.query('begin');
    try {
        const value = await work(clientQueryable(client));
        await client.query('commit');
        return value;
    } catch (cause) {
        // A rollback that fails itself (connection gone) must not mask the
        // error that caused it; the pool drops a broken connection on release.
        await client.query('rollback').catch(() => undefined);
        throw cause;
    }
}

// Bound to one checked-out connection. A nested `transaction` joins the open
// one instead of starting a second: Postgres has no nested transactions, and a
// service composing two transactional repositories should not need to know
// whether it is already inside one.
function clientQueryable(client: PoolClient): Queryable {
    const tx: Queryable = {
        async query<Row>(sql: string, params: readonly unknown[] = []): Promise<Row[]> {
            const result = await client.query(sql, params as unknown[]);
            return result.rows as Row[];
        },
        transaction: (work) => work(tx)
    };
    return tx;
}
