# Client application notes

These notes record choices this application makes that the template's guidance does not decide. Read them together
with the root `AGENTS.md` and the synchronized Skills under `.agents/skills/`.

## Document Center (issue #652)

The employee experience is `client/pages/documents/` (`index.tsx` hosts the browse and ask tabs, with
`document-browse.tsx`, `ask-panel.tsx` and `document-preview.tsx`); the administration console is
`client/pages/settings/document-center/`. `client/lib/document-center.ts` is the single place the endpoints' types and
one function per endpoint live, shared by both surfaces, so a contract change is made once. `client/routes.ts`
declares the `/documents` app route and the `document-center` settings group.

Decisions worth knowing before changing it:

- **Create, edit, versions and restore are child routes, not open dialogs.** Each list page renders `<Outlet />` and
  the form/overlay routes are declared under it in `client/routes.ts`; an overlay closes through
  `useRouteOverlay().close()` and reloads its list through the `reload` it reads from `useOutletContext`. Do not add
  an `open` prop.
- **The preview is a child route** (`/documents/:documentId`) so the address is shareable; the admin console links to
  the same app route rather than duplicating a preview.
- **Documents are text.** "Download" builds a `.md` file in the browser from `documents.content`; there is no server
  download endpoint and no file field.
- **The question panel shows citations, and says so when there is no basis.** It never hides a citation behind a
  generic answer; each citation links to the document it came from. That is the user-visible half of the
  "must not cite what the asker cannot read" rule — the server enforces it, the client presents the result.
- **`DataTable` comes from `@nocobase/data-table`.** Its `data` prop is a mutable array, so a page holding `readonly`
  rows passes a copy.

## Verification

The static checks (typecheck, lint, prettier, Vitest) pass for this feature. A browser acceptance pass was **not**
performed — the assistant had no browser or subagent available — so the rendered layout and the download flow have
not been confirmed by eye. Run the application and walk `/documents` and the settings console before release.
