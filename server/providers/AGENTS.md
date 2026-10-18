# Todos and the expiry schedule

The `todos` table (`database/main/migrations/202610170001_create_todos.ts`) is owned by two pieces in this
directory: `todos.ts` (the service) and `expire-todos-schedule.ts` (the Scheduler target and the registered plan).
The browser side is `client/pages/todos/` and `client/pages/schedules/`.

## `expired` belongs to the schedule, not to the API

- No route and no form writes `expired`. `POST /api/todos` creates a row with `completed` and `expired` false, and
  `PATCH /api/todos/:todoId` accepts `completed` only — a body carrying `expired` is rejected with `400` by the strict
  request schema, not silently ignored. Keep it that way: the page is the evidence of what the schedule did, so a
  client must not be able to produce the same mark.
- The mark is stored rather than derived from `dueAt < now`, so a completed todo that was never swept does not read as
  expired, and the transition stays visible after the due time has passed.
- `TodoService.expireDue()` is a single conditional `updateMany` matching `completed = false AND expired = false AND
dueAt < now`. It only ever updates, never inserts or deletes, which is what makes repeat and overlapping runs
  harmless. Do not turn it into a per-row `updateOne` or an insert; that would reintroduce duplicate records and make
  two concurrent firings race.

## The registered schedule

- `SCHEDULE_KEY = 'todos.expire-due'` is the plan's identity and survives a title or cron change. The schedule is
  registered imperatively in `ExpireTodosScheduleProvider.boot()` with `defineSchedule()`; the Scheduler plugin ships
  no page and no create/edit API, so this provider is the only place a plan can be declared.
- `TARGET_TYPE = 'app.expire-todos'` is the dispatch target. Its `start()` returns a synchronous
  `{ state: 'completed', outcome: 'succeeded', result: { expiredCount } }`; the Scheduler records that result as
  `resultSummary`, which the execution-records drawer renders. A rejected config is `config-must-be-an-empty-object`.
- The cron is `* * * * *` in `UTC` on purpose: expiry compares instants, so the plan's time zone must not shift the
  comparison, and the one-minute interval keeps the demonstration short. It is also the only "run now": the Scheduler
  exposes no trigger endpoint, and writing `expired` by hand to show a run would fake a dispatch. Never add a
  button or a route that bypasses the Scheduler for this.
- `boot()` is `async` and guarded by `container.has(schedulerServiceToken)`, and the provider is listed after
  `TodoProvider` in `index.ts`: the schedule resolves the todo service, and the Scheduler's `sync()` must run after
  migrations have created `todos`. Job `attempts` stays 1 — the target is a one-shot sweep, not a retrying task.
- The UI for it is `/schedules` (`client/pages/schedules/`); it reads the plugin's endpoints directly. The plugin is a
  registered dependency, not something this application wraps.

## Seeds

`database/main/seeds/202610170002_seed_todos.ts` is a regular seed, not `sample: true`: the install pipelines run
`db apply` without `APP_SAMPLE_DATA`, and a sample seed would be recorded as skipped. It is idempotent by title
(`exists` then `createOne`) and uses fixed timestamps so a repeat run neither duplicates rows nor overwrites a title,
`completed` or `expired` a user has since changed. The overdue row starts `expired: false` so a fresh install still has
one real transition for the schedule to make.

The todo page's own rules are in `client/pages/todos/AGENTS.md`.
