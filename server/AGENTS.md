# Server notes

Application-owned guidance for `server/` and `database/`. The root `AGENTS.md` is
template-owned and restored on a template upgrade; this file records what this
application adds on top of it.

## Device ledger

The device ledger is one feature across four files:

- `database/main/migrations/202610070001_create_devices.ts` — creates the `devices`
  Collection: `id`, a unique `code`, a required `name`, a required `status` and an index
  on `status`. `status` is a plain string; the closed set of values lives in code
  (`DEVICE_STATUSES` in `server/providers/devices.ts` and the route schema), not in a
  database enum, so adding a status is a code change and a new migration only if a
  constraint is wanted.
- `database/main/seeds/202610070002_sample_devices.ts` — the two sample devices. It is
  `sample: true`, so it loads only when the database is installed with
  `APP_SAMPLE_DATA=true` (or `pnpm nocobase db sample` in development). It checks for the
  code before creating and never overwrites an edited row, so a re-run is safe.
- `server/providers/devices.ts` — the `DeviceService` (domain logic only: no Hono
  context, no HTTP status codes) and its provider. The provider binds the service to
  `deviceServiceToken`; routes resolve that token, never construct the service. The
  service converts the numeric auto-increment id to the string the API returns and
  checks a code is free before writing, because the unique index raises the driver's raw
  error rather than a `RepositoryError`.
- `server/routes/devices.ts` — the HTTP layer. Registered in `server/routes/index.ts`.
  `GET /api/devices` (list, `status` filter, `page`/`pageSize`), `GET /api/devices/:deviceId`,
  `POST /api/devices` and `PATCH /api/devices/:deviceId`. Every route declares
  `describeRoute()` and validates input with `apiValidator()`; domain errors
  (`DeviceNotFoundError`, `DeviceCodeTakenError`) are translated to `ApiError` in the
  router's `onError`.

Errors use the standard body with `domain: 'devices'` and reasons `DEVICE_NOT_FOUND`
(404) and `DEVICE_CODE_TAKEN` (409). Clients branch on `reason`, never on `message`.

Auth is installed per route (`authentication.required()` then
`authorization.middleware()`), never with `router.use('*')`: every API contribution mounts
into one router, so a catch-all would run on another contribution's paths. The route is
identity-based — any signed-in user may view, add and edit — so no `resource`/`action`
grant is required.

## Testing writes against a cookie session

A cookie-authenticated write (`POST`, `PATCH`, `DELETE`) is refused with
`403 INVALID_CSRF_ORIGIN` unless its `origin` is trusted. A route test that signs in and
then writes must set `APP_PUBLIC_ORIGIN` (so the application's own origin is trusted) and
send a matching `origin` header. `tests/logic/devices-api.test.ts` shows the setup.
