# Server application notes

This application adds an IT service desk on top of the template runtime. Read `../docs/it-service-desk.md` for the
feature, roles, demo accounts and the seed decision.

- `database/main/migrations/202610140001_create_it_service_desk.ts` creates `tickets`, `it_ticket_files`,
  `lifecycleTransitions` and `lifecycleEffectRuns`. It is immutable history: add a new migration to change the schema.
- `server/it-service-desk/lifecycle.ts` is the ticket state machine (`pending → processing → resolved → closed`, plus
  `returned`) with guards, effects and the 24-hour `remindStale` trigger. It owns `status`, `statusChangedAt` and
  `lifecycleVersion` on `tickets`.
- `server/it-service-desk/service.ts` holds the role/data scoping (`all` / `assigned` / `own`), the dashboard query,
  the per-transition permission checks and the DTO mapping. It is the only place that decides visibility.
- `server/it-service-desk/notifier.ts` resolves the `notification` service and writes inbox notifications whose
  `target.path` is `/tickets/:id`.
- `server/providers/it-service-desk.ts` registers the lifecycle runtime and runs `runTriggers()`, `reclaim()` and
  `recover()` on a 60-second interval, cleared in `shutdown()`.
- `server/routes/{tickets,files,index}.ts` mount under `/api`; each route installs `authentication.required()` and
  `authorization.middleware()` and reads the caller from `context.get('authz')`.
- `server/config/notification.ts` declares the `inbox` channel with the `in-app` provider.
- `@nocobase/logging` is imported by `server/providers/it-service-desk.ts` and therefore lives in `dependencies`, not
  `devDependencies`; the build's server-dependency check fails otherwise.
