# Server: the IT service desk feature

This file documents the server half of the repair-ticket feature. Read it before changing anything under
`server/lifecycles/`, `server/tickets/`, `server/providers/ticket-*.ts`, `server/routes/tickets.ts` or
`server/routes/file-routes.ts`.

## Where each piece lives

| Path                                  | What it is                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `server/lifecycles/ticket-types.ts`   | The ticket record, its states, the role/notifier ports the lifecycle reaches.                                          |
| `server/lifecycles/ticket.ts`         | The state machine: states, transitions, guards, effects, `set`, `validate`.                                            |
| `server/tickets/resources.ts`         | The `tickets` composite resource, record-access scopes and collection permissions, plus `registerTicketAuthorization`. |
| `server/providers/ticket-roles.ts`    | Reads a person's job role and lists engineers/service-desk people.                                                     |
| `server/providers/ticket-notifier.ts` | Composes the bilingual inbox messages and sends them through `@nocobase/app-plugin-notification`.                      |
| `server/providers/ticket-service.ts`  | The domain logic every route calls: create, list, detail, fire, comment, dashboard, executions, overdue reminder.      |
| `server/routes/tickets.ts`            | The `/api/tickets` endpoints.                                                                                          |
| `server/routes/file-routes.ts`        | The attachment repository route, mounted under `auth.required()` with its own ownership check.                         |
| `server/providers/index.ts`           | Registers `TicketServiceProvider`.                                                                                     |

## Rules that are easy to break

- **Every route resolves one composite action.** `TicketService` takes the request's `AuthorizationContext`, calls
  `authorize()` and binds the returned policy to every repository with `withPolicy(...)`. Do not read unrestricted data
  and filter it in JavaScript, and do not use `require()` for a scoped read: it refuses conditional decisions. A ticket
  the actor cannot reach is a `404`, not a `403`.
- **The lifecycle re-checks who may do what.** The guards in `ticket.ts` are the business rules; the route check is the
  second line. Both must agree. `closed` is deliberately **not** `final` — `reopen` leaves it, and the library forbids
  transitions out of a final state.
- **`reason` is validated but not `accept`ed.** `accept` copies input fields onto the ticket row, and `reason` is not a
  column: it goes to the comment the transition writes and to the notification effect. `assigneeId`/`assigneeName` and
  `resolution` are real columns and are `accept`ed. Adding a field to `accept` that has no column fails the transition
  with `FIELD_NOT_FOUND`.
- **Reads of the role tables use direct SQL, never `permissionSets.getEffective`.** SQLite runs one connection, so a
  non-transaction read from inside a guard or effect deadlocks the transition. `ticket-roles.ts` queries the
  assignment tables directly for this reason.
- **The notification manager is a lazy singleton: `resolveIfCreated` reports it absent until something resolves it.**
  `TicketServiceProvider` asks `container.has(notificationServiceToken)` and then resolves it, so a notice is delivered
  the first time one is sent. Reading it with `resolveIfCreated` silently drops every message. If a future service is
  registered the same way, resolve it on demand rather than assuming it has been built.
- **Notifications belong to transitions, not to `onEnter`.** The creation notice is sent by `TicketService.create`
  after the transaction commits; every later notice is a transition effect. A runtime retry then cannot duplicate a
  message. The inbox body is a single string because `InAppMessage` carries no per-recipient locale.
- **The overdue reminder is a sweep.** `TicketServiceProvider` registers a `LifecycleJobs` sweep that calls
  `remindOverdue()` and then `runtime.prune()`. Overdue means `status != 'closed'` and `createdAt` older than
  `overdueHours`; `overdueNotifiedAt` stops a ticket being reminded repeatedly.

## Startup degradation is intentional

`TicketServiceProvider` warns and continues in two cases:

- the authorization plugin is not registered — a host assembled without it still boots, but the permission model is not
  declared;
- the lifecycle log collections do not exist — the effect dispatcher and the overdue sweep are not started.

The second warning is normal in an embedded test scope that starts the app without this application's migrations. In a
real application `DatabaseProvider.boot()` runs migrations and seeds during `bootAll()`, which is **before**
`startAll()`, so the tables exist by the time the provider starts. Do not "fix" the warning by removing the guard.

## Seeds

`database/main/seeds/202611200001_ticket_permission_sets.ts` and `202611200002_ticket_sample_data.ts` must be
**self-contained**: import only packages and `node:*`. The database runner loads a seed with native `import()`, bypassing
Vite and Vitest resolution, so a relative import of an application `.ts` file does not resolve. The permission seed
therefore writes the composite grant in its stored shape, and `tests/logic/ticket-permission-sets.test.ts` checks that
shape against `server/tickets/resources.ts` so the two cannot drift.

## Tests

`tests/logic/ticket-api.test.ts` exercises the endpoints against a real application
(`createAppTest({ createServer: createStandaloneServer })`): unauthenticated requests, the full report → assign → handle
→ confirm flow, scope isolation, an unauthorized transition, a stale version and a repeated request id.
`tests/logic/ticket-lifecycle.test.ts` checks the state machine on its own;
`tests/logic/ticket-migration.test.ts` checks both migrations up and down;
`tests/logic/ticket-permission-sets.test.ts` checks the seed against the declaration.

Cookie-authenticated writes need a trusted origin: the test config sets `app.publicOrigin` and sends a matching
`Origin` header, otherwise the CSRF middleware answers `INVALID_CSRF_ORIGIN`.
