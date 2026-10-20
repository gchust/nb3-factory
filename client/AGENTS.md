# Client notes

Application-specific notes for `client/`. See the root `AGENTS.md` and `.agents/skills/nocobase-app-development/` for
the framework guidance these notes supplement.

## Todos feature (`client/pages/todos/index.tsx`)

- The page is deliberately **read-only**: one table with title, due time, completed and expired. `expired` is set only
  by the "check expired todos" schedule, so there is no create/edit/delete UI; the API supports CRUD but a form is out
  of scope for this small build. The page exists to make the three states the schedule must distinguish visible.
- No `@tanstack/react-query`: the application (and `@nocobase/app-client`) mounts no `QueryClientProvider`, so pages
  load with `useApiClient()` + `useEffect` + local state and their own abort/retry handling.
- Dates are formatted with `Intl.DateTimeFormat` from `useLocale()`; no date library is added.

## Scheduler management (`client/pages/schedules/index.tsx`)

- The Scheduler plugin contributes no pages of its own, so this application builds its management view over the
  plugin's public API (`/api/scheduler/schedules` and `/scheduler/schedules/:id/occurrences`). It shows name, enabled
  state, cron/timezone, next and last run, run count, target label and recent executions, and can enable/disable a
  schedule. The plugin exposes no "run now" action, and this page does not fake one by writing the database.
- The Scheduler API stores and returns a schedule's title and description as plain text, in the language it was
  registered with, so those strings do not pass through the application's locale files for free. The page recognizes
  the application's own schedule by its stable key (`todos.checkExpired`) and its target type
  (`app.todos.markExpired`) and translates both through `schedules.definitions.todosCheckExpired` and
  `schedules.targets.todosMarkExpired`; anything else falls back to the registered text. Add a new definition's copy
  to those groups when the application registers another schedule.

## Dependencies

- `client/components/ui/calendar.tsx` and `react-day-picker` were removed: no page in this application needs a date
  picker after the todo page became read-only, so no new client dependency was added.
- `client/components/ui/table.tsx` was added from the shadcn registry for the two tables. It needs no extra package.
