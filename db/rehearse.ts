import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import pg from 'pg';
import { migrate, type AppliedMigration } from './migrate.ts';

// `npm run db:rehearse -- <backup> [--keep]`: restores a production backup into
// a throwaway Postgres and applies the pending migrations to it, so a migration
// that rewrites existing rows meets real rows before it meets production. The
// e2e database migrates while empty and cannot catch that (0004, 2026-10-31).
// Plain-text output on purpose: this is a person at a terminal, not a log sink.

const execFileAsync = promisify(execFile);

/** Production's major version, pinned by digest like every image in the repo. */
const IMAGE =
    process.env.REHEARSAL_POSTGRES_IMAGE ??
    'postgres:18.6@sha256:3a4264520e121176619f54ff867d12774bc81e95e7b84db58d63bccdb6144b81';
const DATABASE = 'rehearsal';
const PASSWORD = 'rehearsal';
const READY_TIMEOUT_MS = 60_000;

interface Sandbox {
    container: string;
    url: string;
}

type RowCounts = Map<string, number>;

interface RehearsalArgs {
    backupPath: string;
    keep: boolean;
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const sandbox = await startSandbox();
    try {
        await rehearse(sandbox, args.backupPath);
    } catch (cause) {
        console.error(`\nrehearsal failed: ${(cause as Error).message}`);
        process.exitCode = 1;
    } finally {
        await finish(sandbox, args.keep);
    }
}

function parseArgs(argv: string[]): RehearsalArgs {
    const keep = argv.includes('--keep');
    const backupPath = argv.find((arg) => !arg.startsWith('--'));
    if (!backupPath) {
        console.error(
            'usage: npm run db:rehearse -- <backup.sql.gz | backup.dump | backup.sql> [--keep]'
        );
        process.exit(2);
    }
    return { backupPath, keep };
}

async function rehearse(sandbox: Sandbox, backupPath: string): Promise<void> {
    console.log(`restoring ${path.basename(backupPath)} into ${IMAGE}`);
    await restore(sandbox.container, await readFile(backupPath));
    const before = await rowCounts(sandbox.url);
    const applied = await migrate({ connectionString: sandbox.url });
    const after = await rowCounts(sandbox.url);
    printApplied(applied);
    printCounts(before, after);
}

async function finish(sandbox: Sandbox, keep: boolean): Promise<void> {
    if (keep) {
        console.log(
            `\nsandbox kept: ${sandbox.url}\nremove it with: docker rm -f ${sandbox.container}`
        );
        return;
    }
    await execFileAsync('docker', ['rm', '-f', sandbox.container]);
}

// --- the throwaway Postgres ---------------------------------------------------

async function startSandbox(): Promise<Sandbox> {
    const { stdout } = await execFileAsync('docker', [
        'run',
        '-d',
        '--rm',
        '-e',
        `POSTGRES_PASSWORD=${PASSWORD}`,
        '-e',
        `POSTGRES_DB=${DATABASE}`,
        '-p',
        '127.0.0.1::5432',
        IMAGE
    ]);
    const container = stdout.trim();
    await waitUntilReady(container);
    const port = await publishedPort(container);
    return { container, url: `postgres://postgres:${PASSWORD}@127.0.0.1:${port}/${DATABASE}` };
}

// Asked over TCP: during first start the image runs a temporary server on the
// socket only, and a socket check would pass before the real one is up.
async function waitUntilReady(container: string): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const ready = await execFileAsync('docker', [
            'exec',
            container,
            'pg_isready',
            '-h',
            '127.0.0.1',
            '-U',
            'postgres',
            '-d',
            DATABASE
        ]).then(
            () => true,
            () => false
        );
        if (ready) return;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`sandbox ${container} not ready after ${READY_TIMEOUT_MS / 1000}s`);
}

async function publishedPort(container: string): Promise<string> {
    const { stdout } = await execFileAsync('docker', ['port', container, '5432/tcp']);
    const port = stdout.trim().split('\n')[0]?.split(':').at(-1);
    if (!port) throw new Error(`no published port for ${container}, got: ${stdout.trim()}`);
    return port;
}

// --- restoring the backup ------------------------------------------------------

// Dokploy writes `pg_dump` output through gzip; a custom-format dump starts with
// PGDMP and goes to pg_restore, anything else is plain SQL for psql. Both run
// inside the sandbox, so the host's client version never matters.
async function restore(container: string, raw: Buffer): Promise<void> {
    const bytes = isGzip(raw) ? gunzipSync(raw) : raw;
    const custom = bytes.subarray(0, 5).toString('latin1') === 'PGDMP';
    const tool = custom
        ? [
              'pg_restore',
              '--no-owner',
              '--no-acl',
              '--exit-on-error',
              '-U',
              'postgres',
              '-d',
              DATABASE
          ]
        : ['psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DATABASE];
    await pipeInto(['exec', '-i', container, ...tool], bytes);
}

function isGzip(bytes: Buffer): boolean {
    return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function pipeInto(dockerArgs: string[], input: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn('docker', dockerArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`restore exited ${code}: ${stderr.trim() || '(no output)'}`));
        });
        child.stdin.end(input);
    });
}

// --- what changed --------------------------------------------------------------

async function rowCounts(url: string): Promise<RowCounts> {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
        const { rows } = await client.query<{ table_name: string }>(
            `select table_name from information_schema.tables
             where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`
        );
        return await countEach(
            client,
            rows.map((row) => row.table_name)
        );
    } finally {
        await client.end();
    }
}

async function countEach(client: pg.Client, tables: string[]): Promise<RowCounts> {
    const counts: RowCounts = new Map();
    for (const table of tables) {
        const { rows } = await client.query<{ n: number }>(
            `select count(*)::int as n from public.${pg.escapeIdentifier(table)}`
        );
        counts.set(table, rows[0]?.n ?? 0);
    }
    return counts;
}

function printApplied(applied: AppliedMigration[]): void {
    console.log('');
    if (applied.length === 0)
        console.log('no pending migrations: the backup is already up to date');
    for (const { name, executed } of applied) {
        console.log(executed ? `applied ${name}` : `recorded ${name} (schema was already present)`);
    }
}

function printCounts(before: RowCounts, after: RowCounts): void {
    console.log('\nrows per table, before -> after');
    const tables = [...new Set([...before.keys(), ...after.keys()])].sort();
    for (const table of tables)
        console.log(`  ${table.padEnd(26)} ${describeChange(before.get(table), after.get(table))}`);
}

function describeChange(before: number | undefined, after: number | undefined): string {
    if (after === undefined) return `${before} -> dropped`;
    if (before === undefined) return `new -> ${after}`;
    return before === after ? `${before}` : `${before} -> ${after}`;
}

await main();
