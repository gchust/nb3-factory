# Client notes

Application-owned notes for the browser side. The template's guidance is in the repository-root `AGENTS.md`; this file
records what is specific to this application, so a template upgrade can reconcile the two.

## The materials feature

`client/pages/materials/` is the internal materials reading and temporary sharing feature. It is declared in
`client/routes.ts` under `/materials`, all with `authz` on the page resource `materials`.

- `/materials` — the list (`index.tsx`). The server filters, the page sorts and paginates in the browser over the
  largest page the endpoint allows (`PAGE_SIZE = 100`).
- `/materials/new` — the create dialog (`new.tsx`, `material-form.tsx`).
- `/materials/:materialId` — the detail drawer (`detail/index.tsx`).
  - `/materials/:materialId/edit` — the edit dialog (`detail/edit.tsx`).
  - `/materials/:materialId/shares` — the temporary-sharing dialog (`detail/shares.tsx`), a nested overlay over the
    detail drawer.

**The page never decides permissions itself.** `GET /api/materials` answers with a `meta.capabilities` object
(`canCreate`, `canUpdate`, `canDelete`, `canShare`) computed from the requester's authorization policies, and the page
shows or hides actions from it. `useCan` is not used for collection actions — the capability flags are the single
source of truth, and every write is enforced again on the server. Adding an action means extending both the endpoint's
capabilities and the page.

**The list column set adapts to the requester.** A reader with no row actions gets no actions column at all
(`hasRowActions` in `index.tsx`). Keep that: an action a reader cannot take must not appear as a disabled control.

## Staff administration

`client/pages/staff/` is the people-management page. It is registered under a `settings` navigation group in
`client/routes.ts`; the `staff` child carries `authz: 'unrestricted'` because only root may open it.

- `index.tsx` — the list, built on `UsersClient` from `@nocobase/app-plugin-users/client/user-client`. The Users plugin
  ships no page of its own, so this is the application's.
- `roles.tsx` — `staff/:userId`, the permission-set editor opened as a routed child dialog. It reads the list's data
  from `useOutletContext<StaffOutletContext>()`; the Users API has no "get one user" endpoint, so the list reloads after
  a save. Protected sets (`assignable === false`, such as `root`) are shown disabled and lock saving, so a save cannot
  silently drop them.
- `user-status-dialog.tsx` — the disable/enable confirmation. A disabled account loses access on its next request, which
  is what the acceptance criteria for a departed colleague check.

## Components the application owns

- `client/components/data-table/` — the table, built on `@tanstack/react-table` as the table reference requires. Use it
  for every list; do not hand-write a table on the `Table` primitive. `@tanstack/react-table` is pinned to `^8`: `^9`
  changed the API. The `useReactTable` call carries an `eslint-disable-next-line react-hooks/incompatible-library`
  comment because the rule fires on the library and `--max-warnings 0` would otherwise fail the lint.
- `client/components/session-expired-alert.tsx` — the 401 state. A page shows it instead of a generic error an action
  could never retry through; the user starts `refresh()` themselves.
- `client/hooks/use-url-search.ts` — the list search box backed by the URL.

`client/components/ui/table.tsx` and `client/components/ui/checkbox.tsx` were added from the shadcn registry. Keep them
as the CLI writes them.

## Locales

Every user-visible string is a translation key present in **both** `client/locales/en-US.ts` and `client/locales/zh-CN.ts`
(`zh-CN.ts` is typed against the English shape, so a missing key is a compile error, and
`tests/logic/app-locale-coverage.test.ts` scans the sources for keys that were never translated).

Follow the template's mixed convention: system copy uses both nested groups and flat dotted keys, and the application
uses **flat dotted keys** (`'materials.title'`) so a new key can never replace a system group by accident. The nested
keys the application does read (`actions.save`, `dataTable.noResults`) come from `client/locales/system/`; do not
redeclare them.
