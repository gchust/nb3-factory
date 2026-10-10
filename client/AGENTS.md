# Client — application notes

## Document library (资料库)

The library UI lives entirely in `client/pages/library/` and is declared in
`client/routes.ts`. Its root route uses the page grant
`{ type: 'page', id: 'library.documents' }`; every overlay child declares
`authz: 'skip'` because it inherits the root's guard.

- `index.tsx` — the list on `/library`, with a `DataTable`. It offers New,
  open-detail, edit and delete only when `useLibraryPermissions()` says the
  signed-in user holds the matching composite action. That gate decides what is
  drawn; it is not security. The server enforces the same grant on every call.
- `detail/index.tsx` — `/library/:documentId`, a `RouteDrawer` opened over the
  list. `detail/edit.tsx` is the edit form stacked on that drawer.
- `new.tsx` — `/library/new`, a `RouteDialog`.
- `edit.tsx` — `/library/edit/:documentId`, reached from a row's menu, which is
  the sibling of the list rather than a child of the drawer.
- `library-document-form.tsx` is shared by the create dialog and both edit
  routes. The overlay footer submits it by form id; `useRouteOverlay()` is only
  called from components rendered inside the overlay (the body and footer
  wrappers), never from the page that returns the overlay element.
- `library-api.ts` wraps the `/api/library/documents` endpoints. `types.ts`
  mirrors the server's response shape; `use-library-permissions.ts` holds
  `LIBRARY_RESOURCE_ID`, which must stay equal to `LIBRARY_RESOURCE_ID` in
  `server/library-resources.ts`.

Reading is not editing: the reader's permission set grants `view` only, so the
list hides every write affordance and the row menu shows nothing to delete.

## UI primitives

Installed by the shadcn CLI in `client/components/ui/` and left as the CLI
wrote them. Registry primitives import `cn` from the `cn` package; application
and template code imports it from `@/lib/utils`. Both are correct — do not
"fix" one into the other.
