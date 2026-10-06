# Frozen

These Ecto migrations are history, not a place for new work. As of 2026-10-06
(migration plan step 3) the schema is owned by `frontend/db/migrations`:
`0001_baseline.sql` captures the schema these files produced, and every change
since is a numbered SQL file applied with `npm run db:migrate` in `frontend/`.

`mix ecto.migrate` still works on a database built from the baseline, because
the baseline records every version listed here in `schema_migrations`.
