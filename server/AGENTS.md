# Server notes

Application-specific notes for `server/`. See the root `AGENTS.md` and `.agents/skills/nocobase-app-development/` for
the framework guidance these notes supplement.

## Todos feature (`server/providers/todos.ts`, `server/routes/todos.ts`, `server/routes/schemas.ts`)

- The application's own API is namespaced under `/api/todos`. `defineApiRoutes()` mounts the returned router at `/api`,
  so the todo routes are registered on a **sub-router mounted at `/todos`** rather than at `/`. A top-level `/:todoId`
  would otherwise collide with the data routes' `/:collection` and with the root list route. Scope middleware to the
  sub-router (`todos.use('*', …)`), never to the outer `router.use('*', …)`, which would leak into every other `/api`
  contribution.
- `TodosProvider.boot()` registers the Scheduler target and declares the schedule. It first checks
  `this.app.container.has(schedulerServiceToken)` and returns early when the Scheduler plugin is absent, because the
  application-owned runtime tests in `tests/logic/app-server.test.ts` compose a runtime with the app's providers but
  without plugins. The application's own runtime always registers the plugin, so this only covers isolated runtimes.
- `markExpired(now)` is the single writer of `todos.expired`. It is idempotent: `updateMany` filters on
  `completed = false AND expired = false AND dueAt < now`, so a second run updates zero rows. The route layer rejects
  a client-supplied `expired` field (it is not in `UpdateTodoInput`), keeping `expired` owned by the schedule.
- Schedule key: `todos.checkExpired`; target type: `app.todos.markExpired`; cron `* * * * *` in `Asia/Shanghai` (the
  short cycle is deliberate, so one real run can be observed).

## Tests

- `tests/logic/todos.test.ts` and `tests/logic/todos-schedule.test.ts` sign in with a **bearer token** from
  `POST /auth/sign-in/username`, not the session cookie. A cookie-authenticated write from a non-browser client is
  rejected with `403 INVALID_CSRF_ORIGIN` unless the request carries a trusted `Origin`/`Referer`; the bearer token
  has no ambient browser credential, so the origin check does not apply.
- `todos-schedule.test.ts` starts the real application and waits up to 90 s for the every-minute schedule to fire,
  then asserts the overdue todo flipped to `expired` and a `succeeded` occurrence was recorded. It is intentionally
  slow — it is the one end-to-end proof that scheduling (not a direct DB write) performs the marking.
