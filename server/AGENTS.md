# Server notes

## Scheduled overdue marking

`server/providers/todos.ts` owns the todo domain: `createTodoService(database)` exposes
`listPage({ page, pageSize })` and `checkOverdue(now = new Date())`. The latter is the only
writer of `todos.overdue`; it updates rows matching `completed = false AND overdue = false AND
due_at < now` and returns `{ updatedCount }`. It never inserts, so repeated firings cannot create
duplicate todos and a second firing reports `updatedCount: 0`.

`server/providers/todo-scheduler.ts` registers the Scheduler target type
`app.todos.check-overdue` (target `start()` calls `checkOverdue`) and the schedule
`todos.check-overdue` titled `检查过期待办`, cron `* * * * *`, timezone `UTC`, enabled. Both run in
`boot()`; the provider no-ops when the Scheduler plugin is not registered, so keep it after
`TodoProvider` in `server/providers/index.ts`.

The Scheduler plugin contributes no client pages: the application's `/scheduler` pages read its
API directly (see `client/AGENTS.md`) and can enable or disable a plan through the plugin's `/enable`
and `/disable` routes. Do not add a "run now" path that writes `todos` outside the schedule's target
or records an execution without going through the Scheduler.

The three walkthrough rows are a required seed (`database/main/seeds/202610070001_todos.ts`), not a
`sample: true` one: the verification environment installs with `pnpm nocobase db apply` and never
sets `APP_SAMPLE_DATA`, so a sample seed would be skipped and the todo page would be empty. See
`database/AGENTS.md`.
