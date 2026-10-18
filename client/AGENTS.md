# Client application notes

This application adds an IT service desk on top of the template shell. Read `../docs/it-service-desk.md` for the
feature, roles and demo accounts.

- `client/routes.ts` declares `/`, `/tickets`, `/tickets/new`, `/tickets/:ticketId`, the `/tickets/:ticketId/<action>`
  dialogs, `/team` and `/inbox`. Ticket pages use `authz: 'skip'`; `/team` declares an `it-team` page grant.
- `client/pages/tickets/` holds the ticket list, create dialog, detail page and the shared action dialog. The detail
  page is a top-level route sibling of `/tickets`; action dialogs are its children and read the ticket from
  `useOutletContext<TicketDetailOutletContext>`.
- `client/pages/team/index.tsx` is the root-only user and role administration page. There is no Users management
  page; this is where an administrator creates accounts and assigns the `it-engineer` / `it-service-desk` permission
  sets.
- `client/pages/home/index.tsx` is the dashboard, not the template welcome page. The template's welcome-page files
  (`capabilities.ts`, `prompt-dialog.tsx`, `use-copy.ts`) were removed.
- `client/pages/tickets/{types,api,labels}.ts(x)` hold the DTOs, the `useApiClient` calls and the status/urgency
  label and badge helpers. Pages fetch with `useState`/`useEffect` and a `reload` counter rather than react-query.
- The `itTicketFiles` upload field is `FileUploadField` from `#extensions/nocobase-file-component-ui`, backed by the
  `itTicketFiles` file repository.
- All user-visible strings live in `client/locales/{en-US,zh-CN}.ts` under the `tickets.*` group; the template's own
  copy stays in `client/locales/system/`.
