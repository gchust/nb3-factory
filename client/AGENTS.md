# Client notes — document library

This application's client is the default NocoBase 3 app shell plus one feature: an internal document
library. Everything below is application-owned; `/client/AGENTS.md` records the parts a template
upgrade has to reconcile.

## Where it lives

| Path                              | What it is                                                               |
| --------------------------------- | ------------------------------------------------------------------------ |
| `client/routes.ts`                | The `documents` and `settings` routes and their URL-addressable children |
| `client/pages/documents/`         | The list, the create/edit dialogs, the detail drawer                     |
| `client/pages/settings/`          | The admin page: staff permissions and temporary sharing, as two tabs     |
| `client/lib/documents-client.ts`  | The only place an API path for this feature is spelled                   |
| `client/pages/documents/types.ts` | Shared resource ids, the `:documentId` parser, the outlet contexts       |
| `client/hooks/use-url-search.ts`  | Debounced `?q=` search bound to the URL                                  |

`documents-client.ts` is the single API layer. Every page calls it through `useApiClient()`; no page
calls `fetch` or builds an `/api` URL by hand. If an endpoint changes, it changes there and in
`server/routes/documents.ts` together.

## Overlays are routes, not component state

Create, edit and detail are child routes declared in `client/routes.ts`, not a `Dialog open={...}`
state:

- `/documents/new` — the create dialog.
- `/documents/edit/:documentId` — a row menu's Edit, alone over the list.
- `/documents/:documentId` — the detail drawer; `/documents/:documentId/edit` stacks the edit dialog
  on the drawer.

The list renders `<Outlet context={outletContext} />` and provides `DocumentsListContext`
(`reload`). The detail drawer renders `<Outlet context={editContext} />` and provides
`DocumentEditContext` (`onSaved`, `onNotFound`) to the dialog stacked on it. `useRouteOverlay()` is
called only from inside an overlay's body or footer, never from the page that returns the overlay.

## Deliberate deviations from the frontend examples

- **The list uses a hand-written shadcn `Table` with server-side pagination and sorting**, not the
  example's `DataTable` + `@tanstack/react-table`. The list is small and the server already sorts and
  pages it; a table state library would add a dependency and a second source of truth. If the list
  grows columns, interactions or client-side grouping that justify `@tanstack/react-table`, move it
  then.
- **The form is plain React state**, no `react-hook-form`/`zod` on the client. The server still
  validates every write with `apiValidator()`; the client only checks title presence/length for
  immediate feedback.
- **Discard confirmation is a nested `AlertDialog` driven by a Promise-based `beforeClose`**, never
  `window.confirm`. `beforeClose` returns `false` while submitting and a Promise while a dirty form
  waits for the answer.

## Text

Every user-visible string is a key in `client/locales/en-US.ts` and `zh-CN.ts` under `documents.*`,
`settings.*`, `navigation.*` and a few `actions.*`/`status.*` additions. `en-US.ts` states the
wording; `zh-CN.ts` mirrors the whole shape.

One trap: the Users plugin returns a permission set's title as an **i18n key plus namespace**
(`labelI18nKey` / `labelI18nNs`), not translated text. `client/pages/settings/users-card.tsx`
renders those through a small `PermissionSetLabel` component that translates in the declared
namespace, falling back to the raw label. Rendering `role.label` directly shows
`documents.permissionSets.editor`.

## Seed credentials (development and sample data)

`APP_SAMPLE_DATA=true` seeds three documents and two accounts; `pnpm nocobase db sample` loads them
on an existing installation. The admin is the installation's own administrator.

| Who      | Username | Password    | Email             | Permission set     |
| -------- | -------- | ----------- | ----------------- | ------------------ |
| 资料员甲 | `jia`    | `jia123456` | `jia@example.com` | `documents-editor` |
| 阅读者乙 | `yier`   | `yi123456`  | `yi@example.com`  | `documents-reader` |

The three documents are 公开资料 P (published, not confidential), 私有草稿 D (draft, owned by 甲)
and 保密资料 C (confidential, owned by 甲).
