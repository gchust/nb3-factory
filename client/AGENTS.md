# Client notes

Application-owned pages and components live here. This file records decisions a future change has to know; the
repository-root `AGENTS.md` describes the framework scaffolding and stays as the template wrote it.

## Todo feature

- `pages/todos.tsx` is route `/todos` (declared in `routes.ts`, `authz: 'skip'`). It is **read-only on purpose**:
  it renders the `todoItems` table and a Refresh button. The `overdue` flag has exactly one writer, the
  `todos.mark-overdue` schedule, so there is no create dialog, no inline complete toggle, and no page-level call
  that marks a todo. Keep it that way — a browser must not be able to mark a todo overdue out of band.
- `pages/schedules.tsx` is route `/schedules` (declared in `routes.ts`, gated by
  `{ resource: { type: 'page', id: 'scheduler.schedules' }, action: 'access' }`). The Scheduler plugin ships an API
  but **no management page**, so this is the application's own minimal UI over it: `GET scheduler/schedules`,
  `GET scheduler/schedules/:id/occurrences`, `POST .../enable`, `POST .../disable`. There is no run-now action; do
  not add one by writing to the database — a manual run has to go through the same target and execution record.
- Schedule and target names are stored as human-readable English data. The page maps the stable schedule `key` and
  target `type` to translation keys (`SCHEDULE_TITLE_KEYS`, `TARGET_LABEL_KEYS`) and falls back to the stored string,
  so a schedule the page has never heard of still renders. Add a mapping when you define a new schedule in
  `server/providers/`.
- All user-visible text is keyed. The `todos.*` and `schedules.*` groups live in `locales/en-US.ts` (the shape) and
  `locales/zh-CN.ts`; `navigation.todos` and `navigation.schedules` extend `system/en-US`'s `navigation` group.
  `tests/logic/app-locale-coverage.test.ts` scans this directory for `t('...')` literals and interpolated prefixes,
  so a new status label needs a key in **both** locales. `ScheduleOccurrence.status` uses `timed_out` with an
  underscore, and the occurrence-status keys match it.
- Dates are formatted with `new Date(value).toLocaleString(i18n.language)`. `useTranslation()` returns
  `{ t, i18n, ready }` — there is no `language` property.
- `useApiClient()` is the only data path; never call `fetch` or hard-code `/api`.
