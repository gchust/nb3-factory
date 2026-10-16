# Client: the todo and schedule pages

The template ships only the shell and the sign-in pages. On top of that this application adds the todo list, a view of
the scheduled task and its execution records, and a small settings page that turns the task on or off. The scheduled
task `todos.check-expired` is the only writer of a todo's `expired` flag; no page creates or deletes a todo.

## `/todos` — `pages/todos/index.tsx`

One table with the four fields the task maintains: 标题 (title), 截止时间 (dueAt), 已完成 (completed) and 已过期
(expired). It loads `GET /api/todos` through `useApiClient` and offers a refresh button. There is no create form and no
completion toggle even though the fields are editable in principle; the requirement is a view of the task's result.

The route is declared in `client/routes.ts` with `authz: { resource: { type: 'page', id: 'todos' }, action: 'access' }`
— the same grant `GET /api/todos` enforces — and navigation title `navigation.todos`.

## `/schedules` — `pages/schedules/{index.tsx,occurrence-dialog.tsx,types.ts}`

The Scheduler plugin ships the service and the API but no page, so this page is where `检查过期待办` is visible: its
name, whether it is enabled, and each schedule's execution records. The list is read from `GET /api/scheduler/schedules`
and the records from `GET /api/scheduler/schedules/:id/occurrences`. It declares
`page:scheduler.schedules/access`, which the Scheduler's routes already enforce.

The enabled state is editable from the status column through `ScheduleEnabledSwitch`, which calls the Scheduler's own
`POST /api/scheduler/schedules/:id/enable|disable` endpoints; the row's badge then reflects the stored answer, so a
refresh reads the same value back. Enabling applies at once with a toast (T4.3); disabling stops the task from running,
so it opens an AlertDialog that names the plan first (I2) and the switch follows the stored state, not local state, so
cancelling leaves it on. The load/toggle logic is shared with the settings page through `client/hooks/use-schedules.ts`.

A reload keeps the current rows and disables the refresh button instead of replacing the table with a skeleton; the
skeleton is shown only before the first load.

## `/settings` — `pages/settings/index.tsx`

An ordinary sidebar page, not a separate settings area: the template has none, and the header carries no settings
entry. Today the only setting is whether the scheduled task runs, shown as a card with the plan and the same
switch the Schedules page uses. It reuses the `page:scheduler.schedules/access` grant, since whoever may see the plans
may turn one off.

The execution records dialog is a plain controlled `Dialog`, not a `RouteDialog`. The page is a management view of
another plugin's data; keeping the dialog in component state is the smallest thing that shows the records and does not
put a scheduler route under the application's route tree.

## What a template upgrade must reconcile

- `client/routes.ts`: the `todos`, `schedules` and `settings` entries (and their position before `inbox`).
- `client/locales/en-US.ts` and `zh-CN.ts`: the `todos`, `schedules` and `settings` groups, plus the added
  `navigation.todos`, `navigation.schedules` and `navigation.settings` keys inside the spread of the system
  `navigation` group.
- `client/components/ui/table.tsx` and `client/components/ui/switch.tsx`: added from the shadcn registry for these
  pages. Re-add them from the registry rather than merging them by hand.
- `client/components/schedule-enabled-switch.tsx`, `client/hooks/use-schedules.ts`: application components that a
  template upgrade leaves alone unless the scheduler API changes.
- `tests/logic/client-routes.test.ts`: the pinned page-authorization list.
