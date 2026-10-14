# IT service desk

An internal repair-ticket system: employees report an issue with an urgency and optional screenshot, the service
desk assigns it to an engineer, the engineer records the handling process and solution, and the reporter confirms
the fix to close the ticket or returns it for further handling.

## Roles and visibility

Business roles are permission-set assignments, not new roles. A user may hold any combination.

| Role (`authorizationPermissionSets.key`) | Sees                          | May do                                                       |
| ---------------------------------------- | ----------------------------- | ------------------------------------------------------------ |
| `it-service-desk`                        | every ticket                  | create, assign, reassign, progress, resolve, confirm, return |
| `it-engineer`                            | only tickets assigned to them | progress, resolve, return                                    |
| none (any signed-in employee)            | only tickets they reported    | create, confirm, return                                      |
| root (unrestricted)                      | every ticket, the Team page   | everything                                                   |

The service layer decides the scope by permission-set key (`server/it-service-desk/service.ts`): root and
`it-service-desk` see `all`, `it-engineer` sees `assigned`, everyone else sees `own`. The `/api/tickets/:id` route
answers `404 TICKET_NOT_FOUND` for a ticket outside the caller's scope, so it does not leak the ticket's existence.

Per-transition permission is enforced in the service, not in the lifecycle guards: a transition outside the caller's
role answers `403 TRANSITION_NOT_ALLOWED` (for example an employee firing `assign`). `GET /api/tickets/:id` returns a
`canFire` list of transitions the caller may fire, and `available` with the lifecycle's own `allowed`/`blockers`, so
the UI can disable or explain an action without guessing.

## Demo accounts

The seed `database/main/seeds/202610140002_it_service_desk_demo_data.ts` creates these accounts and four tickets.
Password for every demo account is `admin123`.

| Username      | Role              | Notes                                     |
| ------------- | ----------------- | ----------------------------------------- |
| `servicedesk` | `it-service-desk` | sees all tickets, dispatches to engineers |
| `engineer1`   | `it-engineer`     | assigned the VPN and monitor tickets      |
| `engineer2`   | `it-engineer`     | assigned the shared-drive ticket          |
| `employee1`   | (member)          | reported all four demo tickets            |

Root signs in as `nocobase` / `admin123`. The seed is idempotent (guarded on an empty `tickets` table) and never
overwrites existing rows.

### Why the demo data is a required seed, not `sample: true`

`AGENTS.md` says application-required data is a seed under `database/main/seeds/` while sample data is declared
`sample: true` and only loads when the database is installed with `APP_SAMPLE_DATA=true`. The deployment and
verification path runs `nocobase db apply` only, which applies required seeds and skips sample ones. The accounts
above have to exist so the roles and the dashboard can be exercised on a fresh install without a manual setup step,
so the demo data is a required seed. This is a deliberate deviation from the `sample: true` convention; if a future
change should make it opt-in, move the file to `defineSeed({ name, sample: true, run })` and re-verify that `db apply`
still produces a usable application.

## Pages

| Route            | Page                         | Notes                                                                 |
| ---------------- | ---------------------------- | --------------------------------------------------------------------- |
| `/`              | Dashboard                    | pending assignment, overdue (>24h unresolved), per-engineer workload  |
| `/tickets`       | Ticket list                  | filter by status and urgency, search title/description                |
| `/tickets/new`   | Create-ticket dialog (child) | title, description, urgency, screenshots                              |
| `/tickets/:id`   | Ticket detail                | fields, handling history, attachments, the caller's available actions |
| `/tickets/:id/*` | Action dialogs (children)    | `assign`, `reassign`, `progress`, `resolve`, `return`                 |
| `/team`          | Team (root only)             | create users, assign and edit roles                                   |
| `/inbox`         | Notifications                | assignment, resolution, return and reminder notifications             |

All ticket pages declare `authz: 'skip'`; `/team` declares an `it-team` page grant and the server enforces root-only
access independently.

The dashboard's "overdue" count and list are keyed on `createdAt`, not `statusChangedAt`: the 24-hour `remind`
self-transition rewrites `statusChangedAt`, so measuring from it would drop a ticket off the board exactly when it
should stay visible until it is resolved.

The dashboard rows link to `/tickets/:id` as a full page. A stricter reading of the overlay rules would declare the
detail drawer under the dashboard's own route and open the record over the page the user is on; that was not
implemented, and the list and dashboard share the ticket detail page instead.

## Notifications

The lifecycle effects (`tickets.notify.assigned|resolved|returned|closed|overdue`) write an in-app notification
through the `notification` service on the `inbox` channel, with `target: { type: 'route', path: '/tickets/:id' }`.
`server/config/notification.ts` declares `channels: { inbox: { provider: 'in-app' } }`, which is what registers the
channel. The inbox renders the title as a link to the ticket.

## The 24-hour reminder

The lifecycle's `remindStale` trigger fires the `remind` transition on tickets that are `pending` or `processing`
after 24 hours. It is a self-transition (`manual: false`, `route: record.status`) that only writes `remindedAt`. The
provider (`server/providers/it-service-desk.ts`) runs `runtime.runTriggers()`, `reclaim()` and `recover()` on a
60-second interval and stops the interval in `shutdown()`, so no external job runner is required.

## Screenshots

Tickets reference files from the `itTicketFiles` collection (migration `202610140001_create_it_service_desk`,
exposure `itTicketFiles` in `server/routes/files.ts`). Upload and download go through the file plugin's
`defineFileRepositoryApiRoutes`; the content byte route is public because it is keyed by an unguessable UUID, the
same trade-off the plugin makes for other exposures. The detail page builds each attachment's URL as
`<publicBasePath>/uploads/it-ticket-files/<id>.<ext>`.
