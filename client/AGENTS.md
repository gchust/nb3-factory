# Client notes

## Todo and Scheduler pages

`client/pages/todos/` is a read-only list over `GET /api/todos`. It exists so the
`检查过期待办` Schedule has data to mark; it never writes, and its badge just renders the `overdue`
flag the server sets.

`client/pages/scheduler/` is the application's management surface for scheduled plans. The
Scheduler plugin (`@nocobase/app-plugin-scheduler`) contributes **no pages**, so these pages read
its API directly:

- `client/pages/scheduler/index.tsx` — `GET /api/scheduler/schedules`; the plan name, cron,
  timezone, enabled state and target state, with each row's actions behind an icon-only "…" menu: a link into
  the plan's history and an enable/disable action (disabling is confirmed in an `AlertDialog`).
- `client/pages/scheduler/detail.tsx` — a covering child page (`RouteChildPage`) showing one plan
  and its execution history from `GET /api/scheduler/schedules/:scheduleId/occurrences`, cursor
  paged through `meta.nextPageToken`. Its header carries the same enable/disable control.
- `client/pages/scheduler/actions.tsx` — the shared enable/disable control. It `POST`s to
  `/api/scheduler/schedules/:scheduleId/enable` or `/disable` (the plugin's routes, which return the
  updated plan) and replaces the plan in the page's state; no "run now" path is added, so the only
  thing that writes `todos.overdue` is the scheduled target.

Both require the `page:scheduler.schedules/access` grant declared as `authz` on the `/scheduler`
route in `client/routes.ts`; that is the same resource the plugin's `/api/scheduler/...` routes
check, so one grant opens both.

`client/components/data-table/` and the `table` primitive under `client/components/ui/` were added
from the shadcn registry (`@nocobase/data-table`). `package.json#imports` carries an explicit
`"#components/data-table"` entry because the `#components/*` wildcard does not resolve a directory
index.
