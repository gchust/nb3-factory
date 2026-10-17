# Todo pages

`/todos` renders the list, with the create dialog as the URL-addressable child route `/todos/new`. The data contract
and the schedule that owns `expired` are described in `server/providers/AGENTS.md`; the schedule's own management page
is `client/pages/schedules/`.

- **`expired` is read-only here.** Neither the list nor the create form sends it, and the status badge follows what the
  server returned. The refresh button is the only way to see a new sweep; do not poll or fake the mark in the client.
- **One primary action (L7).** While the list is empty the create button lives inside the `Empty` state; once rows
  exist it moves to the page header. The switch is derived from the loaded rows, so no action is rendered while the
  first load is in flight, and the page must never show both at once.
- **The due time is picked from the `Calendar` in a `Popover`** (`client/components/ui/calendar.tsx`), not a native
  date input. The `<input type="time">` beside it is a deliberate exception: there is no time primitive in the
  library, and a hand-written clock would be more UI than this feature needs.
- **A due time in the past is allowed** and the form says so: the schedule marks the todo expired the next time it
  runs. Do not block it or mark it client-side.
- The row toggle `PATCH`es `completed` and updates the row from the response; it does not refetch the list, and it
  surfaces a `403` as a toast rather than replacing the page.
- Copy lives in `client/locales/en-US.ts` and `client/locales/zh-CN.ts` (`todos.*`). The bilingual UI is checked by
  `tests/logic/app-locale-coverage.test.ts`, so a new string needs both files.
- Tests: `tests/components/todos-page.test.tsx` renders the page with its child route; the sweep, the API contract and
  the seed are covered by `tests/logic/todos-sweep.test.ts` and `tests/logic/todos-seed.test.ts`.
