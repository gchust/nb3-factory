# Server notes

## Device ledger API

- `server/routes/devices.ts` serves authenticated `GET /api/devices`, `POST /api/devices`, `GET /api/devices/:deviceId`, and `PATCH /api/devices/:deviceId`. Every route declares `describeRoute()` and validates input with `apiValidator()`; there is deliberately no delete endpoint.
- `server/providers/devices.ts` owns persistence and duplicate-code handling in `DeviceService`. Routes resolve it through `deviceServiceToken`; keep domain logic there rather than in route handlers.
- Device errors use stable reasons: `DEVICE_CODE_TAKEN` and `DEVICE_NOT_FOUND`. Their `localizedMessage` is translated from keys in `server/locales/{en-US,zh-CN}.ts`; do not return raw reasons or untranslated messages to the browser.
- The `devices` table and its seed are in `database/main/migrations/202610060002_create_devices.ts` and `database/main/seeds/202610070001_devices.ts`. The seed is required installation data, idempotent by `code`, and must not overwrite an edited device.
- `tests/logic/devices-routes.test.ts` covers signed-out rejection, filtering, create, duplicate code, validation, update, and missing records. It needs the fixture auth/secrets config and an `origin` header on writes.
