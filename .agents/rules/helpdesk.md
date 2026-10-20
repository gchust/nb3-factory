# Helpdesk application

This application is an IT service desk built on NocoBase 3. Tickets live in the application's own `tickets`, `ticketComments` and `ticketAttachments` collections, while uploaded files use the File plugin's `ticket_files` collection. State changes go through the `tickets` lifecycle in `server/tickets/lifecycle.ts`; never write a ticket status directly.

## Demo accounts and sample data

The demo is installed by the sample seed `database/main/seeds/202610200002_helpdesk_demo_data.ts`, which runs when a fresh install has `app.sampleData` enabled. `server/config/app.ts` enables that outside production, so both a development `db apply` and the factory's separate test install receive the demo even though installation and application start are different processes. The production guard in the seed keeps known-password accounts out of production; `pnpm start` installs with `NODE_ENV=production` and leaves samples off. Run `pnpm nocobase db sample` in development after a skipped install.

The `sampleDataToken` provider in `server/providers/helpdesk.ts` still enriches the same ticket titles through the real lifecycle on a direct development start. The seed and the provider are both idempotent: the seed uses stable ids, and the provider checks each user and ticket title before creating it, so the demo is never duplicated.

All demo accounts use the password `Helpdesk!2026`:

| Username     | Name       | Jobs                       |
| ------------ | ---------- | -------------------------- |
| `alice.chen` | Alice Chen | Employee                   |
| `evan.park`  | Evan Park  | Employee                   |
| `bob.liu`    | Bob Liu    | Employee, Support engineer |
| `carol.wang` | Carol Wang | Employee, Support engineer |
| `dana.zhao`  | Dana Zhao  | Employee, Service desk     |

Sign in as Dana to see every ticket, assign and cancel work, and read the engineering workload on the home dashboard. Sign in as Bob or Carol to see only tickets assigned to them and to process those tickets. Sign in as Alice or Evan to create and follow only their own tickets; the requester closes a resolved ticket or reopens it to return it to the desk.

## Where the feature lives

- Pages: `client/pages/home/` (desk dashboard), `client/pages/tickets/` (list, create, detail), `client/pages/workflows/` (definitions and authorized execution history).
- API routes: `server/routes/tickets.ts`, `server/routes/workflows.ts`, and the guarded File repository routes in `server/routes/files.ts`.
- Domain logic: `server/tickets/` and `server/providers/helpdesk.ts`.
- Schema: `database/main/migrations/202610070001_create_helpdesk_tables.ts`. The later `202610200001_grant_requester_close_reopen.ts` adds the requester's close/reopen grants to an employee set that an older installation already seeded.
- Permission sets: `database/seed-data/helpdesk-permission-sets.ts` and `database/main/seeds/202610070001_helpdesk_permission_sets.ts`.
- Translations: `client/locales/{en-US,zh-CN}.ts` and `server/locales/{en-US,zh-CN}.ts`.

## Permissions

The `helpdesk.tickets` composite resource is the single permission surface. Page access, API calls and File repository reads all authorize against it. The three prepared permission sets are `employee`, `support-engineer` and `service-desk`; edit their grants in the Settings roles page or the seed definitions, not in a route handler.

The engineering scope `helpdesk.engineerTickets` matches `assigneeId` only: an engineer never sees the unassigned queue, which belongs to the service desk. The employee scope `helpdesk.ownTickets` covers the requester's close and reopen actions as well as view/create/comment/attach.

A new ticket action needs an entry in `server/tickets/resources.ts`, a lifecycle transition, a permission-set grant, and the matching API authorization. Add its English and Chinese labels at the same time; `tests/logic/helpdesk.test.ts` checks that every lifecycle state and transition has a label.
