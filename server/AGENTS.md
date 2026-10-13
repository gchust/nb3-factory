# Server notes

Application-owned routes and providers live here. This file records decisions a future change has to know; the
repository-root `AGENTS.md` describes the framework scaffolding and stays as the template wrote it.

## Todo feature

- `providers/todos.ts` owns the feature. `TodoService.markOverdue(now?)` is the whole business rule: update every
  todo whose `completed` is false, whose `overdue` is false, and whose `dueAt` is not after `now`, setting `overdue`
  to true. It is idempotent (a second run reports `marked: 0`) and **never inserts**, so running the schedule cannot
  create duplicate todos. Keep the rule in the service; the route and the scheduler target are only transports.
- `TodoProvider` (`name = 'app.todos'`) binds `todoServiceToken` in `register()`. In `boot()` it registers the
  `app.todo-overdue` schedule target and the `todos.mark-overdue` schedule (`cron: '* * * * *'`, timezone `UTC`),
  guarded by `container.has(schedulerServiceToken)` so the feature still works if the Scheduler plugin is removed.
  Target registration must happen in `boot()`: the database provider runs migrations first and the Scheduler syncs
  its manifest in `start()`, so a target registered at module load is too early and a duplicate type throws.
  `defineSchedule` creates the row **enabled**; the Scheduler's re-sync keeps the stored `enabled` value, so an
  administrator who disables it is not overridden on the next start.
- `routes/todos.ts` is the only HTTP surface: `GET /api/todos`, mounted by `routes/index.ts`. It requires a session
  (`router.use('/todos', authentication.required())` — scoped to the one path this contribution owns) and has no
  authorization check beyond identity. It carries a `describeRoute()` declaration and validates its query with
  `apiValidator()`, so the OpenAPI document and the `400` come from the framework. Do not add an endpoint that marks
  a todo overdue: the schedule is the only writer.
- `schemas.ts` holds the request/response schemas. The list endpoint pages by `page`/`pageSize` (max 100).
