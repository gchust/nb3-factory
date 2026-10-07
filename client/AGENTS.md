# Client guide

This application is an internal IT service desk: employees report a problem, the service desk
dispatches it to an engineer, the engineer records the handling and a solution, and the reporter
confirms the fix or sends it back. The pages that implement it live under `client/pages/tickets/`
and `client/pages/home.tsx`.

## Ticket pages

- `client/pages/home.tsx` — dashboard. Pending dispatch, overdue tickets and per-engineer
  workload, plus a recent list for anyone who is not the service desk. It reloads on mount and
  links into `/tickets`.
- `client/pages/tickets/index.tsx` — the list. Search and the status/urgency filters are written to
  the URL through `client/hooks/use-url-search.ts` (every list page with a search box uses this
  hook). Rows open the detail child route; "New ticket" opens the create dialog.
- `client/pages/tickets/new.tsx` — a `RouteDialog` child route at `/tickets/new`. It reads a
  screenshot with a file input into a data URL (capped at 2 MB) and posts it as text. A file whose
  type is not `image/*` or that does not decode as an image is rejected before submission, with the
  `tickets.form.screenshotUnsupported` / `screenshotInvalid` message.
- `client/pages/tickets/detail.tsx` — a covering `RouteChildPage` at `/tickets/:ticketId`. It
  renders the fields, the actions the current role may take and the handling timeline. Overlay
  close guards and `BackButton` follow the overlay reference.

Supporting modules in the same folder: `types.ts` (shared types and the role helpers
`isOverseer`), `api.ts` (every `helpdesk/*` call), and `status-badge.tsx`.

## Role-aware UI

The server returns the caller's role from `GET /helpdesk/me`; the client uses it only to decide
which controls to show. `isOverseer(role)` is true for `serviceDesk` and `admin`. Scoping and
every state transition are enforced on the server — never assume the UI decides access.

## Notifications

The in-app message center is the notification plugin's production surface, not its dev-only
`/dev/notification-in-app` route (which a production build strips and the plugin forbids exposing).
`client/pages/notifications/index.tsx` renders the plugin's public `NotificationInAppInbox` at
`/notifications`.

The inbox subscription is mounted once, in `client/layouts/app-layout.tsx`, through
`client/components/notification-inbox-boundary.tsx`. The boundary mounts the plugin's
`NotificationInAppProvider` only when the host registers the application's HTTP and realtime
clients, so a harness or an embedded renderer without them still gets a working shell.
`client/components/notification-bell.tsx` reads the shared runtime context directly and shows the
unread badge when a provider is present; without one it stays a plain link. Both the bell and the
page therefore share one unread-count fetch and one realtime subscription.

## Strings

Every visible string is a key in `client/locales/en-US.ts` and `client/locales/zh-CN.ts`, under the
`home.*`, `tickets.*` and `helpdesk.role.*` blocks. `tests/logic/app-locale-coverage.test.ts` fails
if a key used in a component is missing from either file, so add both at once. The `helpdesk.role.*`
keys label the IT helpdesk role scope that appears on the built-in Users settings page.

## Routes

`client/routes.ts` declares `/tickets` with the `tickets-new` and `tickets-detail` children, plus
`/notifications`. Their `authz` is `'skip'` on purpose: the pages are for any signed-in member and
the endpoint behind each one scopes the data itself. The route test in
`tests/logic/client-routes.test.ts` pins this list.
