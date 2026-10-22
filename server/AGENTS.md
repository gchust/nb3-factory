# Server notes

## Devices API and service

The device ledger's domain logic lives in `server/providers/devices.ts` (`DevicesService`, `devicesServiceToken`,
`DevicesProvider`), registered in `server/providers/index.ts`. The service owns the repository access, the string id
generation and the timestamps; it never reads a request context and never returns an HTTP status.

`server/routes/devices.ts` exposes it:

- `GET /api/devices` — list with `status`, `page`, `pageSize` (max 100) and `meta.total`.
- `POST /api/devices` — `201` with the created record.
- `PATCH /api/devices/{deviceId}` — `200` with the updated record.

There is deliberately no `DELETE`; the issue asks only for view, create, edit and filter by status.

The whole `/devices` router requires a session (`auth.required()`). It checks no business permission because the
requirement is that every signed-in user may use the ledger; do not add a permission check without also adding the
matching page/API grant, which the authorization Skill forbids writing into the root or member set for an application
feature.

Failures carry a stable `reason` (`DEVICE_CODE_TAKEN`, `DEVICE_NOT_FOUND`) plus a `localizedMessage` built from
`getRequestTranslator(context)` in `server/locales/{en-US,zh-CN}.ts`. The client branches on `reason`, so keep the
reasons stable and the locale keys in both files.

`tests/logic/devices-routes.test.ts` starts the real application with `createAppTest()` and covers anonymous, admin,
ordinary-member, validation, duplicate-code and missing-record responses.
