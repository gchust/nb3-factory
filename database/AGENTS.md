# Database notes

Application-specific notes for `database/main/`. See the root `AGENTS.md` and
`.agents/skills/nocobase-app-development/references/migrations.md` for the framework guidance these notes supplement.

## Todos schema (`202610130001_create_todos`)

- `todos` uses a string `id` (varchar 64) rather than an auto-increment. `reference` is an internal, nullable, unique
  column used only to make the seed idempotent; it is not exposed by the API.
- `dueAt` is `datetime` (wall-clock local time), matching how the schedule compares it. The index
  `idx_todos_expiry_scan` covers `(completed, expired, dueAt)`, the exact predicate `markExpired` scans.

## Sample todos seed (`202610130002_seed_todos`)

- **This seed is intentionally a regular seed, not `sample: true`.** Sample seeds only run when the database is
  installed with `app.sampleData` set (`APP_SAMPLE_DATA=true`), and the application's automated verification installs
  the database without it, so a sample seed would be recorded as skipped and the todo page would come up empty. These
  three rows are the demonstration the feature needs in order to be verifiable, so they are treated as installation
  data. If the feature is ever reshaped, reconsider this rather than assuming sample data will load.
- It writes the three states the schedule must distinguish: past-due and open (the schedule will mark it expired),
  future and open, and past-due but completed (the schedule must leave it alone).
- `upsertOne` on `reference` makes re-running the seed a no-op and never overwrites a state the schedule already
  changed (an expired row stays expired).
