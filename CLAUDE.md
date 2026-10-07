## Code style

- Functions: 4-20 lines. Split if longer.
- Files: under 500 lines. Split by responsibility.
- One thing per function, one responsibility per module (SRP).
- Names: specific and unique. Avoid `data`, `handler`, `Manager`.
  Prefer names that return <5 grep hits in the codebase.
- Types: explicit. No `any`, no `Dict`, no untyped functions.
- No code duplication. Extract shared logic into a function/module.
- Early returns over nested ifs. Max 2 levels of indentation.
- Exception messages must include the offending value and expected shape.

## Comments

- Keep your own comments. Don't strip them on refactor — they carry
  intent and provenance.
- Write WHY, not WHAT. Skip `// increment counter` above `i++`.
- Docstrings on public functions: intent + one usage example.
- Reference issue numbers / commit SHAs when a line exists because
  of a specific bug or upstream constraint.

## Tests

- Tests run with a single command: `npm test` in `frontend/`.
- `frontend/`: Playwright e2e only — a few specs covering the main flow, no
  unit tests. Specs live in `frontend/e2e/`. They run against the seeded
  `tickets_e2e` database (built by `e2e/support/database.ts`), never
  `backend_dev`. Every spec is cataloged in `E2E.md`; a PR that adds or
  changes a flow updates the spec and the catalog together.
- Tests must be F.I.R.S.T: fast, independent, repeatable,
  self-validating, timely.

## Dependencies

- Inject dependencies through constructor/parameter, not global/import.
  Server modules: each factory takes one `deps` object and returns an
  interface (`eventService(deps: { repository })`). The graph is assembled
  only in `frontend/src/lib/container.ts` and reaches handlers via
  `event.locals.container`.
- Wrap third-party libs behind a thin interface owned by this project.

## Structure

- Schema changes are SQL files in `frontend/db/migrations` (`NNNN_name.sql`),
  applied with `npm run db:migrate`.
- Follow the framework's convention (SvelteKit).
- Prefer small focused modules over god files.
- Predictable paths.

## Svelte tooling

- The Svelte MCP server (`.mcp.json`) and the official skills and subagent
  under `.claude/` are the source of truth for Svelte 5 and SvelteKit
  behaviour: look docs up with `get-documentation` before guessing, and run
  `svelte-autofixer` on every `.svelte` or `.svelte.ts` file touched before
  finishing. Without MCP, `npx @sveltejs/mcp <tool>` gives the same tools.

## Formatting

- Use the language default formatter (`prettier`). Don't discuss style beyond that.

## Logging

- Structured JSON when logging for debugging / observability.
- Plain text only for user-facing CLI output.
