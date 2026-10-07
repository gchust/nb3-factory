# Client conventions (application-owned)

This file documents additions this application made on top of the template. The
template's root `AGENTS.md` is template-owned and is replaced on upgrade; keep
application notes here.

## HR module

- Pages live in `client/pages/hr/` and are declared in `client/routes.ts` as a
  group named `hr` with children `dashboard`, `departments`, `employees`,
  `leave`, `approvals` and `profile`. Each child declares its page `authz`,
  `navigation.title` under the `hr.*` keys, and a lazy `componentLoader`; the
  homepage (`client/pages/home.tsx`) renders the same dashboard.
- All data access goes through `client/pages/hr/api.ts`, a set of plain
  functions whose first argument is an `ApiClient` from `useApiClient()`. Do not
  call `fetch`/`axios`. Mutating calls send the `Origin` header via the client,
  which the server requires.
- List screens load through `useApiData` (`client/hooks/use-api-data.ts`): every
  query input is encoded into the hook's `key`, which is what triggers a reload.
- Forms and detail views are `Dialog`/`RouteDialog` children; the dialog body is
  mounted fresh on each open (`{open ? <Dialog…/> : null}`) so its local state
  resets.
- The employee list is the same component for all roles; the server returns
  fewer fields to a supervisor, and the client keys columns off the rows it
  actually receives rather than requesting a field mask.
- `hr.leave.types.*` holds the leave-type labels. A key whose prefix is also a
  key that receives `count` triggers i18n pluralization — never pass `count` to
  `t()` for these.

## UI primitives

`client/components/ui/` holds only the shadcn primitives in use. Add another
with `yes n | pnpm exec shadcn add <name>` and leave the file as the CLI writes
it except for formatting and any English strings, per the development Skill.
The HR feature additionally installed `badge`, `card`, `select`, `table`,
`calendar` and the `@nocobase/data-table` / `@nocobase/date-picker` items.
