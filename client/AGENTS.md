# Client

Application-owned browser code. Everything under `client/` belongs to this application, not to a plugin: edit it directly. This file documents the document-library pages; keep it beside the code it describes when the pages change. The server side of the feature is documented in `../server/AGENTS.md`.

## Document library pages

Routes are declared in `client/routes.ts`; the pages live in `client/pages/library/`.

| Route                       | Name                  | Page                                | Kind                                              |
| --------------------------- | --------------------- | ----------------------------------- | ------------------------------------------------- |
| `/library`                  | `library`             | `pages/library/index.tsx`           | list page (page authorization `library`/`access`) |
| `/library/new`              | `library-new`         | `pages/library/new.tsx`             | create `RouteDialog`                              |
| `/library/edit/:documentId` | `library-edit`        | `pages/library/document-edit.tsx`   | edit `RouteDialog`, opened from a row's menu      |
| `/library/:documentId`      | `library-detail`      | `pages/library/document-detail.tsx` | detail `RouteDrawer` over the list                |
| `/library/:documentId/edit` | `library-detail-edit` | `pages/library/document-edit.tsx`   | edit `RouteDialog` stacked on the drawer          |

The child routes declare `authz: 'skip'` and inherit the page's `library`/`access` check, which is seeded into the 资料员 and 阅读者 work permissions. Overlays are child routes, not component state: opening one is navigation, and the browser's back button closes it. The only exception is the delete confirmation, a component-state `AlertDialog`.

## How the page reads data

- `index.tsx` loads `GET /api/library/documents` through `useApiClient` and renders one of four states: a `SessionExpiredAlert` on `401`, an error `Alert` with Retry on another failure, a skeleton while loading, an `Empty` state with no rows, or a `DataTable`.
- The server marks each row with `canEdit`/`canDelete` (both grant **and** ownership), so a row menu appears only for a document the caller may actually write. `meta.canCreate` gates the "New document" button. The client never decides permissions itself.
- `document-detail.tsx` and `document-edit.tsx` fetch the record by `documentId` on their own, so a deep link or a refresh while the overlay is open still renders it.
- `document-form.tsx` is the shared create/edit form (`react-hook-form` + zod through the `Field` family). `document-api.ts` holds the typed request helpers and `types.ts` the response shapes.
- `document-flags.tsx` renders the published/draft and confidential badges from the two boolean flags.

## Translation and theme

Every user-visible string is a key in `client/locales/en-US.ts` and `zh-CN.ts`, namespace `nb3-factory`, under the `library` group. Add a key to both files; `zh-CN` is checked against the `en-US` shape at compile time. Use the semantic Tailwind tokens the rest of the shell uses (`bg-background`, `text-muted-foreground`, `border-border`) and never a fixed color, so the pages follow the light and dark themes.

## Accounts for manual checks

| Account   | Username    | Password       |
| --------- | ----------- | -------------- |
| Librarian | `librarian` | `librarian123` |
| Reader    | `reader`    | `reader123`    |

Admin uses the application's existing administrator account. The list page is reachable by both the librarian and the reader; the reader sees only the published, non-confidential 公开资料 P, with no "New" button and no row menu.
