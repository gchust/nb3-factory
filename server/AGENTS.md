# Service desk server notes

This application is an internal IT service desk: an employee raises a repair ticket, the service desk assigns it to an
engineer, the engineer handles it, and the employee confirms the result to close it or returns it for more work.
These notes record the decisions behind the server half so a later change does not undo them by accident.

## The ticket state machine owns every write to status

`server/lifecycles/tickets.ts` defines the `tickets` lifecycle and `server/providers/lifecycle.ts` runs it over the
`lifecycleTransitions` / `lifecycleEffectRuns` tables. `status`, `statusChangedAt` and `lifecycleVersion` on `tickets`
are written **only** by the runtime. Never update them through the repository, and never set them in a migration seed.

The states are `submitted`, `assigned`, `processing`, `resolved`, `returned`, `closed`, `cancelled`, with
`submitted` as the initial state. `TICKET_OPEN_STATES` is the subset that counts as open for the overdue reminder.
The transitions `assign`, `start`, `resolve`, `confirm`, `return`, `rework`, `reassign` and `cancel` are the human
actions; `remindOverdue` is a system-only self-transition fired by a lifecycle trigger, not by a route.

## Why the authorization plugin is not the layer guarding ticket writes

The authorization plugin is registered and still guards **page access** (`authz` on the routes). It is deliberately
not used for ticket writes or record scopes:

- A ticket's allowed actions depend on the record's current state and on roles that are not a permission set — the
  requester, the assigned engineer and a service desk member each see a different subset, and the lifecycle's guards
  already evaluate exactly that inside the transition's own transaction.
- The list/detail scope (`helpdesk` sees everything, an engineer sees their own and assigned tickets, everyone else
  sees only their own) is domain logic in `TicketService.visibilityFilter`, not a configurable named scope, because it
  is tied to the same role mapping. Put the scope in one place; if it ever becomes administrable, move it to a named
  data scope and keep the service as the single caller.

If you add a business action that is **not** a lifecycle transition and does need per-role permission, add it to the
authorization plugin rather than copying role checks.

## Roles live in an application-owned table

`serviceDeskStaff` maps a `user.id` to `helpdesk` or `engineer`; everyone else is an ordinary employee. There is no
third-party role source. `ServiceDeskRoleService` (`server/providers/roles.ts`) is the only reader and writer.

The seed `database/main/seeds/202611010001_service_desk_initial_helpdesk.ts` makes the first user (by `createdAt`) the
first `helpdesk` member so a fresh install has somebody who can assign tickets; it is idempotent and does nothing once
any row exists. Do not turn it into a sample-data seed: without it nobody can open the staff settings page.

## Notifications are bilingual on purpose

Inbox messages are stored as plain strings and the recipient's language is not known when the effect runs, so
`server/lifecycles/tickets.ts` writes the text as `English / 中文`. Do not "translate" it through `t()` at send time:
the effect runs outside a request and has no locale. The application's own pages are translated normally through the
locale files.

`server/config/notification.ts` enables the `inbox` channel (`in-app`), and `server/providers/notifications.ts` is the
only place that resolves the notification service. An effect passes an idempotency key; a retried delivery therefore
notifies once.

## Attachments

Screenshots are stored through the file plugin rather than a hand-rolled upload table. `ticketFiles` is the collection
and `server/routes/files.ts` exposes it as the `ticketAttachments` repository at `/uploads/ticketAttachments`.

The file plugin's content route is **public by design** — anyone holding the file's UUID can fetch it. `server/routes/
files.ts` therefore adds its own `auth.required()` middleware on `/ticketAttachments/*` (API actions) and
`/uploads/ticketAttachments/*` (content), and `server/routes/index.ts` mounts those two contributions **before** the
file routes, because contributions are mounted in array order. If you reorder them, unauthenticated downloads come
back.

A ticket keeps the chosen file ids as the `attachmentIds` JSON column; it does not join to `ticketFiles`. Deleting a
ticket therefore does not delete its files, which is intentional — a screenshot may still be evidence after a ticket
is closed.

## Sample data

`server/providers/sample-data.ts` registers `service-desk/demo` on `sampleDataToken`, so it runs only when the
database is installed with `APP_SAMPLE_DATA=true`, and is recorded as skipped otherwise. It goes through the real
services — the users plugin's `UserManagementService` for the demo accounts, then `TicketService` and the lifecycle
runtime for the tickets — so it exercises the same paths a user would. It creates `demo.engineer` and
`demo.employee` with the password in `DEMO_PASSWORD`. Do not write ticket rows directly from sample data; a direct
write would leave the transition log empty and the ticket's history wrong.

## The HTTP surface

Everything is under `/api/serviceDesk` (`server/routes/tickets.ts`), camelCase, `{ data }` on success, the standard
error body on failure. The routes authenticate first; the record scope and role checks belong to
`TicketService`. `server/routes/schemas.ts` holds the request and response schemas, and every response object carries
`.meta({ ref })` so the OpenAPI document names its component.

`GET /staff` and `PUT /staff/:userId` are helpdesk-only, enforced by the router's own middleware; they are the only
routes that need the extra role check at the HTTP layer.

## Adding a migration

The service desk schema is `202611010001_create_service_desk.ts` and the lifecycle log tables are
`202611010002_create_lifecycle_tables.ts`. They are self-contained by rule; a new column is a new migration, never an
edit to those two. `lifecycleTransitions` and `lifecycleEffectRuns` must keep their unique indexes — the runtime's
idempotency depends on them.

The library's `RepositoryLifecycleStore` writes an effect run's `transitionId` with `key()`, which turns an all-digit
id into a JavaScript **number**, then reads it back with `String()`. `lifecycleEffectRuns.transitionId` therefore has
to be a numeric column (`integer`), not a string one: a string column stores `3` as the text `"3.0"`, and every effect
then fails its `findTransition` with `Filter value is invalid for Field "id" of type "integer"` before it can run.
`tests/logic/service-desk-notifications.test.ts` covers this end to end.
