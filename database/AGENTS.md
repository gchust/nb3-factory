# Data notes

## Todos

`database/main/migrations/202610070001_create_todos.ts` creates `todos` with `title`,
`dueAt`, `completed`, `overdue` and an index on `(completed, overdue, dueAt)` for the overdue scan.
Edit the schema through a new migration, never by hand.

`database/main/seeds/202610070001_todos.ts` inserts one overdue, one future and one
completed todo. It is idempotent by `title` and matches existing rows by title, so re-running it
does not duplicate or overwrite user edits. A seed's export name must equal its filename without
the extension.

It is a required seed rather than a `sample: true` one on purpose: the factory that verifies this
application runs `pnpm nocobase db apply` on a fresh database without `APP_SAMPLE_DATA`, and a
sample seed is recorded as skipped there, which would leave the todo page and the Scheduler
walkthrough with nothing to show. The rows are still fixture data; a real application built from
this template would drop this seed.
