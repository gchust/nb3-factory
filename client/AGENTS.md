# Help desk — client

The help desk's pages live under `client/pages/tickets/` (plus the dashboard at `client/pages/home/`) and are declared
in `client/routes.ts`. They are this application's own source, not a plugin.

## Routes

- `/` — `pages/home/index.tsx`. The landing page renders `GET /helpdesk/overview`, which is role-aware: an employee sees
  their own counts and recent tickets, the service desk also sees the unassigned and overdue tickets and each
  engineer's workload, and an engineer sees their queue.
- `/tickets` — `pages/tickets/index.tsx`. The role-scoped list with filters and a "Submit ticket" action.
- `/tickets/new` — `pages/tickets/new.tsx`. The create form, shown as a `RouteDialog` over the list.
- `/tickets/:id` — `pages/tickets/detail/index.tsx`. A ticket's own page, covering the list, with its comments,
  attachments, screenshot upload and the transitions the caller may take.

All four routes declare `authz: 'skip'`: the server scopes every read and enforces every action, so page authorization
would only duplicate it. `navigation` on `/` and `/tickets` is what puts them in the sidebar.

The in-app notification items link to `/tickets/<id>` (`target: { type:'route', path: '/tickets/<id>' }`); the plugin's
inbox renders that as a `NavLink`. Do not change the path shape without changing the notification target in
`server/helpdesk/notifications.ts`.

## Data access

`useApiClient().request(...)` returns the **full response envelope** `{ data, meta? }`, not the unwrapped value. Every
call that reads the result destructures `{ data }`; forgetting to is the bug that left these pages blank even though the
API returned rows. Endpoints and their shapes are listed in `server/AGENTS.md` and the running `/api/swagger` document.

Lifecycle transitions are recorded by `POST /tickets/:id/fire` with `{ transition, input, version }`. The page does not
re-implement the state machine: it renders the `available` transitions the server returns for the ticket and sends the
one the user chose back. The button label is the server's `available[].title`; the dialog heading is
`helpdesk.transition.<name>.title`.

## Components

- Screenshots use `FileUploadField` from `#extensions/nocobase-file-component-ui/components/file-upload-field`, which
  needs the `ticketAttachments` repository from the file plugin's `clientFileRepositoryManagerToken`.
- Status, priority and category labels render through `pages/tickets/ticket-badges.tsx` and the shared `StatusBadge`.
- The list uses the shadcn `table` primitive directly rather than the full `DataTable`, so the page carries no
  `@tanstack/react-table` dependency.

Every user-visible string is a translation key in `client/locales/en-US.ts` and `zh-CN.ts`. `tests/logic/app-locale-coverage.test.ts`
scans the client source and fails when a literal is missing from either locale.

## Things that are easy to get wrong here

- **A `Select` needs `items` to show a label.** The Base UI `Select.Value` renders the raw `value` unless the root is
  given `items={[{ value, label }]}`, so the assignee trigger otherwise shows an internal user id. Pass the translated
  label list for every select whose value is not its own label.
- **The transition dialog starts from the ticket.** `TransitionDialog` initializes priority and category from the
  `ticket` it is given, because `assign` always sends `priority` and a dialog default would silently overwrite it.
- **The list behind a child page must be refreshed explicitly.** `/tickets/:id` opens over the list, which stays
  mounted; the detail calls the list's `reload` from `useOutletContext` alongside its own re-fetch after a transition.
- **Screenshot uploads check the bytes.** `pages/tickets/attachments.ts` verifies the image signature and decodes the
  file before upload; `FileUploadField` runs a `validateFile` prop before uploading and reports a rejection through
  `onError`, which `new.tsx` renders. A name-based `accept` check alone lets a mislabeled or damaged file through.
