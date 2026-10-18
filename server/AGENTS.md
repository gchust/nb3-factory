# Application notes (server)

Read the template's `AGENTS.md` and the `nocobase-app-development` Skill first; this file records
only what is specific to this application.

## The overdue-todo check

Everything for it lives in one provider: `server/providers/todos.ts`.

- `TodosService` holds the domain logic (`list`, `create`, `setCompleted`, `expireOverdue`). It is
  bound to `todosServiceToken` from the provider's `register()` and reaches the database through
  `databaseManagerToken` — no route touches a Hono context or a status code.
- The provider's `boot()` registers both halves of the schedule with the Scheduler plugin, reading
  `schedulerServiceToken` from the container. It guards on `container.has()` because the plugin is
  what provides the service and an application must start without it.
- Registration happens in `boot()`, not `start()`: the application boots every provider before it
  starts any of them, and `SchedulerProvider.start()` is what syncs the registered definitions into
  the Scheduler's own tables. Registering later would leave the schedule unsynced.
- The schedule key, the target type and the schedule title are the record's identity. Renaming the
  key is a new schedule; the recorded history stays with the old one.

`expireOverdue()` is one set-based `updateMany` with `filter: completed == false AND expired ==
false AND dueAt <= now`, so it is idempotent (a second run updates 0 rows) and touches neither
future-due nor completed records. `notAfter` is inclusive, so a deadline of exactly `now` counts as
passed.

## No "run now" button

The Scheduler plugin publishes no route that triggers a firing — its API lists Schedules read-only and
enables or disables one; firing belongs to the executor's cron. That is why no page offers "execute
now": a button that called `expireOverdue()` directly would bypass the target and leave no occurrence
record, which is exactly the thing the page exists to show honestly. A run is observed by waiting for
one cron period and reading it back from `/scheduler` (or from the API), and the same short period is
what `tests/logic/todos-schedule.test.ts` waits on.

`dueAt` is a `datetimeTz` column: an instant, stored as RFC 3339 with `Z`, compared portably and
rendered in the reader's own zone. Do not change it to the wall-clock `datetime` type — the
comparison against `now` would then be timezone-dependent.

## Checking a change here

```bash
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm exec vitest run tests/logic/todos-service.test.ts tests/logic/todos-api.test.ts \
  tests/logic/todos-migration.test.ts tests/logic/todos-seed.test.ts
```

`tests/logic/todos-schedule.test.ts` is the end-to-end check and takes about a minute on purpose: it starts a real
application, waits for the Scheduler plugin's own executor to fire the registered `* * * * *` schedule, and asserts
the recorded occurrence and the rows it changed. Run it when the schedule, the target, or the seed changes — not as
part of the fast loop, and never shorten the period to make it quick, since the point is a real firing.

Routes are declared with `describeRoute()` and validated with `apiValidator()`, so a new endpoint
also shows up in the application's API document (there is a test, `tests/logic/app-server.test.ts`,
that fails on an undeclared `/api` route). A cookie-authenticated write additionally needs a trusted
`origin`: tests configure `config.auth.trustedOrigins` and send the matching `Origin` header, or the
authentication plugin answers `403 INVALID_CSRF_ORIGIN`.

## Seed data

`database/main/seeds/202610100002_seed_todos.ts` is a required seed, not sample data: the three rows — one overdue,
one future, one completed — are the fixture the overdue check is observed on, so the check has nothing to act on
without them. It creates no structure, and it is idempotent by `title` rather than upserting on it, because `title`
is a business value the people using `/todos` own and must not carry a constraint that seeding imposed. Seed runs are
serialized under the seed lock, so the read-then-insert cannot race another run.
