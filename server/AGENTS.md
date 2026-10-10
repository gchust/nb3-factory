# Server notes — equipment after-sales service

These notes describe decisions this application made on top of the template.
They are application-owned source; the root `AGENTS.md` is template guidance
that is restored on publish, so app-specific rules belong here.

## Data model

- **User references are plain `string(64)` columns, never `belongsTo(…, 'user')`.**
  `tests/logic/app-server.test.ts` starts the application with no plugins, so a
  relation to the plugin-provided `user` collection fails
  `CollectionRelationValidationError`. Keep `engineerId`/`assigneeId`/`actorId`/
  `createdById`/`uploadedBy` etc. as columns.
- Collections live in `database/main/migrations/202610090001_create_service_system.ts`.
  A migration must be self-contained: spell out every column, index and
  constraint; do not import a collection definition.
- `service_order_files.id` is a uuid and its column has **no database default**,
  so the caller supplies `id: randomUUID()` — an insert that omits it fails
  `NOT NULL constraint failed` at run time, not at build or type-check time.
  Every other business primary key is `increments`. Physical columns are
  snake_case.

## Authorization

- Composites are declared in `server/authorization/resources.ts`; record scopes
  and the field-write policies are in `server/authorization/record-access.ts`.
- `server/authorization/register.ts` places every composite under the `service`
  subsection of the `business` workspace section
  (`authz.ui.place(reference, { section: 'service' })`). Without a placement the
  startup validation logs `composite:<id> is not placed` for each resource.
- **A field-level write policy must list every field the server writes**, including
  `createdAt` and `updatedAt`. The policy check runs on caller-supplied `values`
  before adapters add managed values, and `@nocobase/db@1.0.0-beta.17` has no
  auto-timestamp helper.
- **A collection not referenced by any composite grant is unrestricted.** That is
  why `service_order_logs`, `service_order_files` and device-manual index writes
  are writable by the services that own them without an explicit grant.
- `database/main` seed/migration task containers may resolve only
  `idGeneratorToken` from `@nocobase/app-server/id-generator`. Seeds write
  plugin-owned rows (permission sets, account roles) with raw `query`/
  repository calls, never through the authorization service.
- **Permission-set seeds are insert-only** (`ensurePermissionSet` returns when
  the key exists), so a newly added grant reaches a fresh install but not one
  already seeded; an existing installation needs an administrator edit (or a
  data migration) to pick it up.

## Services and routes

- **`requestContext()` in `server/routes/support.ts` spreads every optional runtime
  service**, e.g. `...(services.workflow ? { workflow: services.workflow } : {})`.
  A service that is not spread is `undefined` to the handler even when it is
  registered. Add a new optional service there as well as in
  `server/services/context.ts`.
- HTTP concerns stay in `server/routes/`; domain logic stays in
  `server/services/`. A service never reads a Hono context or returns a status
  code.
- Every `/api` route declares `describeRoute()` and validates input with
  `apiValidator()`; the API document must have no undeclared routes and no schema
  problems. API-key routes declare `security: []`.

## Workflows

- The order-acceptance lifecycle is a real source workflow under
  `workflows/order-acceptance/`. **A source workflow is materialized only when it
  is enabled through the management API** (`GET /workflows/sources/:key` →
  `POST /workflows/:hash/enable`). Never author a source workflow by writing the
  `workflows` tables directly.
- **A run node executes after the processor yields**, so `WorkflowService.trigger`
  resolves before the handler has changed anything. `server/services/acceptance.ts`
  therefore waits for the run through `waitForRun()` before reading the order
  back. Any new route that must report the finished effect of a run node needs
  the same bounded wait.
- A run handler is self-contained: the materialized artifact directory has no
  resolvable `node_modules`, so **it must not import any external package or
  application source** — only `import type`, which the compiler erases. Resolve
  what it needs from `options.services` instead. Importing `@nocobase/db` (or
  any package) starts failing only when a run executes, in production and in the
  test application alike. It likewise must not import `server/`, and server code
  must not import `workflows/`. `tsc` emits `dist/workflows/**`, but the workflow
  build then replaces each package with digest-addressed artifacts, so the
  compiled plain paths are gone at runtime. A server import of one starts failing
  only when the built app runs — `ERR_MODULE_NOT_FOUND`, which `nocobase start`
  misreports as a missing `dist/server/standalone.js`.
- Share a capability through the application container instead. The server
  registers the transition under `orderAcceptanceServiceToken`
  (`server/services/order-lifecycle.ts`) and the acceptance notifier under
  `acceptanceNotifierServiceToken` (`server/services/notify.ts`) in
  `server/providers/service-orders.ts`; each run handler resolves its token from
  `options.services`. The two sides cannot import one `createServiceToken`
  result across the artifact boundary, so the token is the same object on both
  sides through `Symbol.for` and a `globalThis` registry. The token keys are
  mirrored in `workflows/order-acceptance/server/accept-order.ts` and
  `notify-acceptance.ts`; keep each pair in sync.
- **Relative imports inside a workflow package carry the explicit `.ts`
  extension** (`./order-lifecycle.ts`). The materialized artifact stores the raw
  TypeScript sources and Node's native type stripping resolves only explicit
  extensions; the server build rewrites `.ts` to `.js` via
  `rewriteRelativeImportExtensions`. Extensionless relative imports work in the
  checker but fail when a run executes.

## Tests

- **Relative imports along a chain loaded by `@nocobase/app-testing` use the `.ts`
  extension too**, for the same reason: the standalone test server loads seeds and
  migrations with Node's native type stripping.
- `createAppTest` does not read the application's `config.yml`; supply
  `app.publicOrigin`, `auth.secret` and `session.secret` in the config it is
  given. Cookie-bearing writes also need a trusted `Origin`.
- Tests are outside every tsconfig. Check one with
  `pnpm exec eslint <file>`.
