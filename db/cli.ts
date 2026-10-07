import { migrate } from './migrate.ts';

// `npm run db:migrate`: applies pending SQL migrations to DATABASE_URL.
// Plain-text output on purpose: this is a person at a terminal, not a log sink.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error(
        'DATABASE_URL is required, e.g. postgres://postgres:postgres@localhost:5432/backend_dev'
    );
    process.exit(1);
}

const applied = await migrate({ connectionString });
if (applied.length === 0) console.log('database is up to date');
for (const { name, executed } of applied) {
    console.log(executed ? `applied ${name}` : `recorded ${name} (schema was already present)`);
}
