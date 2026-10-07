# Server guide

The IT service desk feature owns three tables and one service. The client pages under
`client/pages/tickets/` and `client/pages/home.tsx` are the only caller.

## Layout

- `database/main/migrations/202610010001_create_helpdesk_tables.ts` — `helpDeskTickets`,
  `helpDeskTicketLogs`, `helpdeskProfiles`. It is self-contained history: it spells out every field,
  index and constraint and never imports a live collection definition. `reporterId`/`assigneeId`
  are string(64) references to the `user` table kept as plain strings (no cross-plugin foreign key)
  with the display name denormalized alongside, so the helpdesk tables stay independent of the
  authentication and authorization plugins.
- `server/helpdesk/roles.ts` — resolves a user id to `employee` | `engineer` | `serviceDesk` |
  `admin`. An explicit `helpdeskProfiles` row wins; otherwise holding the authorization `root`
  permission set means `admin`; otherwise `employee`.
- `server/helpdesk/service.ts` — `HelpdeskService`, the domain logic: scoping (`canSee`), reads
  (`listTickets`, `getTicket`, `stats`, `listAssignableEngineers`, `nextTicketNo`), writes
  (`createTicket`, `addLog`, `assignTicket`, `processTicket`, `resolveTicket`, `confirmTicket`,
  `rejectTicket`) and notifications (`notify`, `notifyServiceDesk`, `remindOverdueTickets`). It never
  reads a Hono context and never returns an HTTP status; it throws `HelpdeskForbidden` or
  `HelpdeskConflict` and the route maps them.
- `server/helpdesk/role-scope.ts` — a Users-plugin `UserRoleScope` with key `helpdesk` that owns
  the `helpdeskProfiles.role` column. Registering it makes the IT helpdesk role appear as a column,
  filter and drawer on the built-in `/settings/users` page, so an administrator assigns
  `employee`/`engineer`/`serviceDesk` with no bespoke UI. `admin` is deliberately not an option:
  an overseer is derived from the authorization `root` permission set, not from a profile row.
- `server/helpdesk/tokens.ts` — `helpdeskServiceToken`.
- `server/routes/schemas.ts` — the zod request bodies and the response schemas typed against what
  the service returns.
- `server/routes/helpdesk.ts` — `defineApiRoutes` mounted at `/helpdesk`, every path behind
  `auth.required()`. A refused transition from the service becomes `403 HELPDESK_FORBIDDEN` or
  `400 HELPDESK_CONFLICT`; an invisible ticket is `404 HELPDESK_TICKET_NOT_FOUND`. A valid request
  the ticket's state forbids is a failed precondition and is `400`, per the HTTP API contract — do
  not answer it with `409`.
- `server/providers/helpdesk.ts` — binds the service token, registers the helpdesk role scope when
  the Users plugin is present, provisions demo accounts and sample tickets in `boot()`, and runs a
  30-minute `setInterval` (unref'd, cleared in `shutdown()`) that reminds the service desk about
  tickets unresolved for over 24 hours.

## Scoping rules

`employee` sees only tickets they reported. `engineer` sees tickets assigned to them or reported by
them. `serviceDesk` and `admin` see everything. Only an overseer may dispatch, only the assigned
engineer may handle and resolve a ticket, and only the reporter may confirm or send it back. A
request for a ticket outside the caller's scope is a `404`, not a `403`, so ids cannot be probed.

## Sample data

`server/providers/helpdesk.ts` creates four demo accounts (password `Demo@12345`) and five tickets
when the application boots with no helpdesk profiles yet. It is idempotent — each account is looked
up by email first — and every step is wrapped in try/catch so a missing optional capability never
stops startup. It runs in production too, because the running application is expected to ship the
sample data. Sign in as `demo.servicedesk` or `admin@nocobase.com` to see the service-desk view, and
as `demo.employee` / `demo.engineer` for the scoped views.

The username is set explicitly (`demo.employee`, `demo.engineer`, `demo.engineer2`,
`demo.servicedesk`); use it for sign-in rather than the email.

## Reminders

The overdue reminder is a plain interval in the provider rather than a scheduler plugin task,
because it only needs to nudge the service desk and carries no UI-visible schedule. It marks
`remindedAt` so a ticket is only announced once.

The test `tests/logic/helpdesk.test.ts` starts the real application through
`createStandaloneServer` and exercises the anonymous, scoped, dispatch, full flow, refused
transition and role-scope-assignment cases over HTTP.
