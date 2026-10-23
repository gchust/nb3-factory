# Client: the IT service desk feature

This file documents the browser half of the repair-ticket feature. Read it before changing anything under
`client/pages/tickets/`, `client/pages/service-desk/`, the `tickets` routes in `client/routes.ts`, or the
`tickets.*` locale group.

## Routes and pages

| Route                | Page                   | Page grant       | Who sees it                                                   |
| -------------------- | ---------------------- | ---------------- | ------------------------------------------------------------- |
| `/tickets`           | `pages/tickets/index`  | `tickets.list`   | Everyone (the employee set is assigned to `authenticated:*`). |
| `/tickets/new`       | `pages/tickets/new`    | `tickets.new`    | The employee and service-desk sets.                           |
| `/tickets/:ticketId` | `pages/tickets/detail` | `tickets.detail` | The employee, engineer and service-desk sets.                 |
| `/service-desk`      | `pages/service-desk`   | `service-desk`   | The service-desk set.                                         |

The parent `/tickets` page renders an `<Outlet/>`; the two children are an overlay (`new`) and a routed child
(`:ticketId`). The home page adds `ServiceDeskHomeSection` under the existing intro, gated by `useCan` so a person
without the `dashboard` action sees nothing. That gate and the fetch it guards live in **two components**, not one: a
caller who may not read the numbers never mounts the request, and `tests/components/home.test.tsx` — which renders the
home page without an application root — never reaches a service container. Keep the split when editing the section.

**`/service-desk` is deliberately one route.** Its three surfaces (the dashboard, the process administration, the
ticket queue) are selected with `?tab=` and `?ticket=` search parameters rather than nested child routes, so the page
grants stay one id per surface and the URL a notification opens is a single link. Do not split it into children without
also migrating the stored page grants.

## Conventions that matter here

- **Fetch through `useTicketRequest`** in `pages/tickets/api.ts`. It derives `loading` from the stored result rather
  than setting state synchronously in an effect, and turns a `403`/`404` into the shared empty/denied view. All ticket
  endpoints live in `api.ts`; components never call `useApiClient` directly for ticket data.
- **Gate the dashboard with `useCan({ resource: { type: 'composite', id: 'tickets' }, action: 'dashboard' })`** before
  fetching it. An employee holds no `dashboard` grant and the endpoint answers `403`.
- **One screenshot per ticket.** `new.tsx` uses `FileUploadField` with `multiple={false}`, `accept: ['image/*']` and a
  5 MB cap, uploading through the `ticketAttachments` client file repository. `removeOnDelete` is off: the uploaded
  file is referenced by the ticket after submit, and the uploader may preview it before the ticket exists.
- **Hooks live in `hooks.ts`/`hooks.tsx`, not beside a component.** The ESLint `react-refresh/only-export-components`
  rule forbids exporting a hook from a component module, so `useTicketLabels` and `useTicketDashboardPermission` are in
  `pages/tickets/hooks.ts`.
- **Every user-visible string is a `tickets.*` key** in `client/locales/en-US.ts` and `zh-CN.ts`. Status and urgency
  badges translate the stored value; they never render the raw column value.
- **A transition dialog generates its `requestId` once per open** (`crypto.randomUUID()`), so a retried submission is
  answered with the transition already recorded instead of firing twice.

## Shared pieces

`pages/tickets/shared.tsx` holds `TicketStatusBadge`, `TicketUrgencyBadge`, `TicketMeta`, `TicketError` and
`TicketLoading`; reuse them rather than re-styling a status inline. Styling uses the semantic Tailwind tokens only, as
everywhere else in the application.
