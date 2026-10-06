import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Applies the SQL files under `db/migrations` that the database has not seen
 * yet, in filename order, each in its own transaction, and records them in
 * `public.sql_migrations`.
 *
 * A database Phoenix built already holds the baseline schema. It is recognised
 * by Ecto's `schema_migrations` table: there the baseline file is recorded as
 * applied without being executed, and only later files run.
 *
 * @example
 * const applied = await migrate({ connectionString: process.env.DATABASE_URL });
 * // [{ name: '0001_baseline.sql', executed: true }] on an empty database,
 * // [{ name: '0001_baseline.sql', executed: false }] on one Phoenix built,
 * // [] when up to date
 */
export interface MigrateOptions {
    connectionString: string;
    /** Defaults to the `migrations` folder next to this file. */
    migrationsDir?: string;
}

export interface AppliedMigration {
    name: string;
    /** False when the file was only recorded because its schema was already present. */
    executed: boolean;
}

export const BASELINE_FILE = '0001_baseline.sql';
const TRACKING_TABLE = 'public.sql_migrations';
const FILE_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;
const DEFAULT_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

export async function migrate(options: MigrateOptions): Promise<AppliedMigration[]> {
    const dir = options.migrationsDir ?? DEFAULT_DIR;
    const client = new pg.Client({ connectionString: options.connectionString });
    await client.connect();
    try {
        await ensureTrackingTable(client);
        const applied: AppliedMigration[] = [];
        for (const name of await pendingFiles(client, dir)) {
            applied.push({ name, executed: await applyFile(client, dir, name) });
        }
        return applied;
    } finally {
        await client.end();
    }
}

async function ensureTrackingTable(client: pg.Client): Promise<void> {
    await client.query(
        `create table if not exists ${TRACKING_TABLE} (
            name text primary key,
            applied_at timestamptz not null default now()
        )`
    );
}

async function pendingFiles(client: pg.Client, dir: string): Promise<string[]> {
    const applied = await appliedNames(client);
    const files = await listMigrationFiles(dir);
    return files.filter((name) => !applied.has(name));
}

async function appliedNames(client: pg.Client): Promise<Set<string>> {
    const { rows } = await client.query<{ name: string }>(`select name from ${TRACKING_TABLE}`);
    return new Set(rows.map((row) => row.name));
}

async function listMigrationFiles(dir: string): Promise<string[]> {
    const names = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
    for (const name of names) {
        if (!FILE_NAME.test(name)) {
            throw new Error(`migration file name must match NNNN_snake_case.sql, got: ${name}`);
        }
    }
    return names;
}

async function applyFile(client: pg.Client, dir: string, name: string): Promise<boolean> {
    const execute = !(name === BASELINE_FILE && (await builtByPhoenix(client)));
    await client.query('begin');
    try {
        if (execute) await client.query(await readFile(path.join(dir, name), 'utf8'));
        await client.query(`insert into ${TRACKING_TABLE} (name) values ($1)`, [name]);
        await client.query('commit');
        return execute;
    } catch (cause) {
        await client.query('rollback');
        throw new Error(`migration ${name} failed: ${(cause as Error).message}`, { cause });
    }
}

// Ecto creates schema_migrations before its first migration, so its presence
// means Phoenix built this database and the baseline is already in place.
async function builtByPhoenix(client: pg.Client): Promise<boolean> {
    const { rows } = await client.query<{ present: string | null }>(
        `select to_regclass('public.schema_migrations')::text as present`
    );
    return rows[0]?.present !== null;
}
