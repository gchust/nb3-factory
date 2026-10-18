# Client notes for `nb3-factory`

Everything below is this application's own pages and components. The root
`AGENTS.md` is the template's guidance and is replaced on upgrade; keep
application-specific notes like these in this file.

## Document library pages

| Route               | Component                                                          | Who sees it                                       |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| `/library`          | `pages/library/index.tsx`                                          | anyone holding the `library.documents` page grant |
| `/library/new`      | `pages/library/new.tsx`, a `RouteDialog` over the list             | a caller the server says `canCreate`              |
| `/library/:id`      | `pages/library/detail/index.tsx`, a covering child page            | a caller who may read that document               |
| `/library/:id/edit` | `pages/library/detail/edit.tsx`, a `RouteDialog` over the document | a caller the server says `editable`               |
| `/members`          | `pages/members/index.tsx`                                          | root only (`authz: 'unrestricted'`)               |

The route declarations live in `client/routes.ts`; each page's copy lives in
`client/locales/en-US.ts` and `zh-CN.ts` under the `library.*` and `members.*`
groups. `tests/logic/client-routes.test.ts` pins each page's resolved page
grant, and `tests/logic/app-locale-coverage.test.ts` fails on a missing key, so
update both when a page or a string is added.

### Conventions this feature established

- **The overlay a page opens is declared under that page's route**, so a
  document is addressable on its own (`/library/:id`) and the edit dialog stacks
  on it. The list's search and filters live in the query string, which the
  overlays keep (`location.search`).
- **The client never guesses those permissions.** The document payload carries
  `editable`, `canShare` and `canCreate`, computed server-side from the same
  authorizer the endpoints use, and the pages render an action only when the
  server said so. Reader and maintainer share one page rather than two, and the
  page uses no `useCan`: a stale client-side answer must not be able to promise
  a write the server would refuse. Page _navigation_ is separate and is
  authorized by the `authz` declaration on the route in `client/routes.ts`.
- **Long content is a page, not a drawer.** A document's body is read, so it
  gets its own route and a `BackButton`; only the create/edit forms are dialogs.
- **A `Button` that renders a `Link` needs `nativeButton={false}`**, and
  `DocumentVisibility` renders a `<span>` because it sits inside `PageHeader`'s
  description, which is a `<p>`. Both were real console warnings before.
