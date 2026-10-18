# server/ — application-owned server code

## Overdue todo marking (Issue #708 scheduling)

`providers/todo.ts` owns the todo domain and registers its scheduled task. Two
constants are the contract between this file and everything else:

- `TODO_EXPIRY_TARGET = 'app.todo-expiry'` — the Scheduler target type.
- `TODO_EXPIRY_SCHEDULE_KEY = 'todos.check-expired'` — the schedule's stable key.

The target and the schedule are registered in `boot()`, not `register()`, because
the Scheduler service registers itself in its own `register()` and only exists by
boot time. The guard `if (!this.app.container.has(schedulerServiceToken)) return;`
keeps the application usable when the Scheduler plugin is not registered.

The schedule is `{ cron: '* * * * *', timezone: 'Asia/Shanghai' }` — a controlled
short cycle for the build test, not a production cadence. `markExpired()` is an
idempotent `updateMany` over `completed = false AND expired = false AND dueAt < now`;
it never inserts, so repeated firings cannot create duplicate todos.

## Seed data

`database/main/seeds/202610070002_default_todos.ts` is a plain (non-sample) seed
holding the three todos the build test needs: one past due and incomplete, one in
the future, and one completed but also past due. It is a plain seed because the
factory applies seeds with `nocobase db apply` on a fresh connection and never
runs `db sample` or sets `APP_SAMPLE_DATA`; a `sample: true` seed would be recorded
as skipped and the verification database would come up empty. The seed is keyed on
the record titles, so re-running it is a no-op.

## Routes

`routes/todos.ts` mounts under `/api` via `defineApiRoutes()`:
`GET /api/todos` and `PATCH /api/todos/:todoId`. Both use `auth.required()` and
declare themselves for the OpenAPI document (`describeRoute()` + `apiValidator()`).
Authorization is identity-only because the product defines no roles.

Cookie-authenticated writes are rejected without a trusted `Origin`
(`INVALID_CSRF_ORIGIN`); the browser sends it, and tests must send
`origin: 'http://localhost'` with `auth.trustedOrigins` configured to match.
