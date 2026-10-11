# client/ — application-owned pages

## Todos (`/todos`) and Scheduler (`/schedules`)

`pages/todos/` renders the single `todos` table and lets a signed-in user complete
or reopen a todo. It never marks a todo expired itself — that transition belongs to
the scheduled task, and this page only reads the result. `pages/schedules/` shows
the schedules this application defines (defaulting to `todos.check-expired`) and each
firing's history; it can enable or disable a schedule but has no "run now" entry,
because the Scheduler plugin exposes no public trigger API. A firing is proven by
waiting for the cron and reading the occurrence record.

Both routes are declared in `client/routes.ts` with `auth: 'required'` and
`authz: 'skip'`. `skip` is deliberate for the Scheduler page: the plugin's client
catalog registers `settings:scheduler.schedules/read` while its routes check
`page:scheduler.schedules/access`, so a client-side resource guard could hide the
page from an administrator who is allowed to use it. The API is the single
enforcement point and the page renders the `SCHEDULE_ACCESS_REQUIRED` 403. The
todos page follows the same shell pattern as `home` and `inbox`.

Locales live in `client/locales/en-US.ts` and `zh-CN.ts` under the `todos` and
`schedules` groups; keep both languages in step — a missing key in `zh-CN.ts` is a
compile error. The `schedules.occurrences.*` group carries the firing history copy.
