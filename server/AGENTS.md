# Server: todo expiry scheduling

This directory is the application's own server source. Beyond the template scaffolding it holds one feature, wired in
three places a future template upgrade has to reconcile.

## What the feature is

`todos` (created by `database/main/migrations/202610070001_create_todos.ts`) has `title`, `dueAt`, `completed` and the
derived `expired`. A scheduled task marks a todo expired when its `dueAt` has passed and it is not completed. Nothing
else writes `expired`.

`database/main/seeds/202610070001_default_todos.ts` inserts the three todos the rule is observed against — one overdue
and unfinished, one far in the future, one completed — all with `expired = false`, so only the schedule's own run can set
the flag. It is a **required** seed, not a `sample: true` one: sample data is recorded as skipped unless the database is
installed with `APP_SAMPLE_DATA`, which the deployment does not set, and the application would then start with an empty
list that no run could be checked against. It skips a title that already exists, so repeated `db apply` runs do not
duplicate the rows.

- `providers/todos.ts` — `TodoService` (business logic: `list`, `expireOverdue`) and `TodoProvider`.
- `routes/todos.ts` — `GET /api/todos`, the page's data.
- `routes/schemas.ts` — the `Todo` response schema.
- `providers/index.ts` / `routes/index.ts` — the registration points that were empty in the template.

## Why it integrates with the Scheduler the way it does

The Scheduler plugin owns the schedule records, the worker and the execution history, but it ships **no pages and no
run-now endpoint**. So the task is not a route the application calls; it is a target the Scheduler invokes.

`TodoProvider.boot()` registers the target (`app.checkExpiredTodos`) and the schedule
(`todos.check-expired`, `*/10 * * * * *`) before the Scheduler's own `start()` reconciles its manifest and starts the
worker. The provider resolves `schedulerServiceToken` inside `boot()`, not at module load, because the application's
service container exists only at that point.

The cron is deliberately short (ten seconds) so a verification run needs no waiting. It is a real cron the
administrator can see and switch in the Scheduler UI; execution records are the Scheduler's own occurrences.

`expireOverdue` filters on `completed = false`, `expired = false` **and** `dueAt < now`. The `expired = false` clause
is what makes the task idempotent: a repeated sweep updates zero rows, and the task never inserts or deletes. An
"execute now" button was intentionally not added — the Scheduler offers no public trigger, and writing to `todos`
directly would bypass the target and the occurrence history.

## Page authorization on the route

`GET /api/todos` is mounted on an isolated `Hono<AuthorizationEnv>` sub-router with `authentication.required()` and an
explicit `page:todos/access` check, mirroring the Scheduler's own `page:scheduler.schedules/access`. The `page`
resource type and `access` action are always registered by `createAppAuthorization`, so the check resolves for every
application. `client/routes.ts` declares the same resource for the page, and `tests/logic/client-routes.test.ts` pins
it.

If the template changes the route factory signature or the authorization middleware types, `routes/todos.ts` is the
file to re-check first; the `server-routes` guidance in `.agents/skills/nocobase-app-development` shows the current
pattern.
