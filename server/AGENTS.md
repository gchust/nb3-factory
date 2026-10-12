# Help desk — server

Everything under `server/helpdesk/` and the two files that wire it up, `server/providers/helpdesk.ts` and
`server/routes/helpdesk.ts`, is this application's feature. It is not a plugin, so it is edited here and not released.

## Shape

- `database/main/migrations/202610200001_create_helpdesk.ts` creates `tickets`, `ticketComments`, `ticketAttachments`
  (a file-record collection) and the lifecycle log collections. It is immutable history: add a new migration instead.
- `server/helpdesk/lifecycle.ts` and `lifecycle-provider.ts` define the ticket state machine and its guards. Every
  status change, including the overdue reminder, goes through the `LifecycleRuntime` (`runtime.create` / `runtime.fire`),
  never through direct SQL. `createLifecycleJobs` from `@nocobase/lifecycle/jobs` drives delayed effects; it is started
  and stopped by the provider, so a single-process development run owns the reminders.
- `server/helpdesk/resources.ts` defines the composite resource `helpdesk.tickets` (actions `view`, `create`, `comment`,
  `assign`, `start`, `resolve`, `confirm`, `reopen`, `dashboard`), the two named record-access scopes
  (`helpdesk.reporter`, `helpdesk.assigned`) and the collection permissions those actions grant.
- `server/helpdesk/provision.ts` creates the three permission sets and the demonstration users/tickets on first start.
  It is idempotent and guarded by `tickets.count > 0`. It uses `runtime.fire` directly, so it passes `assigneeName`
  itself rather than going through `HelpdeskService.fire`.
- `server/helpdesk/service.ts` is the domain service. Routes never touch the database directly.
- `server/helpdesk/notifications.ts` sends the in-app notifications (`target: { type: 'route', path: '/tickets/<id>' }`)
  and translates their titles and bodies.

## Authorization

- Every route installs `auth.required()` and `authorize.middleware()` on the paths it owns. Reads then use
  `authz.database.policyFor(collections, ...)` and a repository bound with `withPolicy`; the action's data scope decides
  what each role sees.
- A **composite** action always resolves to a `conditional` decision, so `authz.require(...)` never accepts one. Ticket
  creation instead inspects the `create` decision's `conditions.database.tickets` policy and throws
  `AuthorizationDeniedError` when it is absent (`HelpdeskService.create`). Do not switch it back to `require`.
- A denied read surfaces as `403 READ_FORBIDDEN` from the policy-bound repository; a permitted read that matches no row
  surfaces as `404`. Both are possible on the list and detail routes, so both are declared in the API document.
- Permission sets are granted per action with an explicit data scope: a bare `comment: {}` falls back to the action's
  default (reporter) scope and refused the engineer. Keep the scope on every non-employee action.

## Identifiers

NocoBase 3 does not generate row ids. Built-in collections supply their own (Better Auth, the notification plugin, the
file plugin all use `randomUUID()`), and the migration declares `uuid('id').primary().notNull()` with no default. Every
insert — including the sample tickets in `provision.ts` and comments in `service.ts` — therefore passes an explicit
`id: randomUUID()`.

## Origin and CSRF

`Auth.required()` refuses cookie-bearing writes whose `Origin` is not trusted. `server/config/auth.ts` trusts the
request's own origin when no `app.publicOrigin` is configured (a directly served development or standalone run). A
deployment behind a reverse proxy must set `APP_PUBLIC_ORIGIN` (or add the frontend origin to `auth.trustedOrigins`);
the fallback still compares the `Origin` header, so a cross-site post remains refused.
