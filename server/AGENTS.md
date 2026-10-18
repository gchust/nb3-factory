# Server notes

## Devices

The `devices` table has exactly the fields the ledger needs — `code` (unique, required), `name` (required) and
`status` (`available` | `borrowed`, defaulting to `available`). It is created by
`database/main/migrations/202610070001_create_devices.ts`; the two starting devices are inserted by the required,
non-sample seed `database/main/seeds/202610070002_seed_devices.ts`.

The seed is idempotent and non-overwriting: for each starting code it runs `findOne({ filter: { code } })` and inserts
only when the code is absent, so a repeat run adds nothing and a device a user renamed or re-statused keeps the user's
values. Do not rewrite it with `upsertOne({ update: {} })` — the repository rejects an empty update
(`RepositoryError: Update values must not be empty.`).

`server/providers/devices.ts` holds `DeviceService` (bound to `deviceServiceToken`, registered by `DevicesProvider`).
It reads and writes through `databaseManagerToken` and maps the integer primary key to a string `id`; the service
throws domain errors (`DeviceCodeTakenError`, `DeviceNotFoundError`) and knows nothing about HTTP.

`server/routes/devices.ts` mounts under `/api/devices` on its own sub-router (`router.route('/devices', routes)`) so
its `routes.use('*', auth.required())` cannot leak into other `/api` contributions. Every endpoint takes a signed-in
session and needs no further permission, so there is no `403` path; the route maps the service's domain errors to
`ApiError` with reasons `DEVICE_CODE_TAKEN` (409) and `DEVICE_NOT_FOUND` (404), which the client turns into translated
copy. Input is validated with zod through `apiValidator()`, and every operation is declared with `describeRoute()`.

## Tests

`tests/logic/devices-migration.test.ts` exercises the migration's `up` and `down` against a real database;
`tests/logic/devices-seed.test.ts` checks the seed loads both starting devices, adds nothing on a repeat run, and
leaves a user-edited device untouched; `tests/logic/devices-routes.test.ts` checks anonymous `401`, the seeded list,
filtering, create/read/update round trips, the `409`/`404`/`400` refusals with their `reason`, an ordinary user's
access, and that every route is declared in the API document (`findUndeclaredApiRoutes`, `findApiDocumentSchemaProblems`).
Cookie-authenticated writes must send an `Origin` the app trusts, so the route test sets `app.publicOrigin`.
