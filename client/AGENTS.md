# Application notes (client)

Application-owned pages live in `client/pages/`. Read the template's `AGENTS.md` and the
`nocobase-app-development` Skill first; this file records only what is specific to this application
and what deliberately departs from that guidance.

## How to check a change here

```bash
pnpm exec tsc --noEmit                         # all client code
pnpm exec vitest run tests/logic/client-routes.test.ts tests/logic/app-locale-coverage.test.ts
pnpm exec eslint <changed files> --max-warnings 0
pnpm exec prettier --write <changed files>
```

Adding a page means updating the pinned list in `tests/logic/client-routes.test.ts`, and every new
`t('…')` key needs a line in both `client/locales/en-US.ts` and `client/locales/zh-CN.ts` (the
coverage test enforces this, `enUS` derives the shape `zh-CN` is checked against).

## Deliberate departures from the frontend guidance

- **No `@tanstack/react-table`, so no `DataTable`.** The list pages render the shadcn `table`
  primitive directly inside a rounded `border-border` container. Both tables are short and need no
  column visibility, sorting, or pagination UI, and the package is not a dependency of this
  application. Add `DataTable` (and the dependency) if a list ever needs those controls; don't grow
  the plain tables into one.
- **`client/components/date-picker.tsx` is the application's own.** `shadcn docs date-picker` does
  not resolve in this registry version, so the component is composed by hand from the generated
  `calendar` and `popover` primitives, following shadcn's Date Picker guide. It takes no `ref` and
  no `aria-invalid`; the surrounding `Field` renders the error.
- **A 401 on a data view renders a plain `Alert`**, not a re-sign-in block. The template ships no
  `SessionExpiredAlert` component and the template's sign-in flow owns session recovery, so a page
  only reports that the session ended.

## Pages this application owns

| Route        | Page                        | Notes                                                                                                                                                                                                                      |
| ------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/todos`     | `pages/todos/index.tsx`     | The verification list for the overdue check: title, deadline, completed, expired. `/todos/new` is its create dialog.                                                                                                       |
| `/scheduler` | `pages/scheduler/index.tsx` | The Scheduler plugin owns the schedules and contributes no page, so this page draws the list. It uses the plugin's page authorization id `scheduler.schedules`, which is why stored grants point at the plugin's resource. |

Both declare `navigation` on their route; nothing about them belongs in the shell. See
`server/AGENTS.md` for the schedule and the endpoint the todo page calls.
