# Server: materials assistant

This application adds one business feature on top of the template: the internal
read-only **materials assistant** (资料助手).

- `database/main/migrations/202610010001_create_materials.ts` creates the
  `materials` table (title + body + a non-writable `confidential` flag).
- `database/main/seeds/202610010002_seed_materials.ts` ships the three
  materials. It is idempotent on `title` and never overwrites a row an
  administrator has since edited.
- `server/materials/` owns the authorization resources, the record-access
  scope, the scoped Repository reads and the keyword search.
- `server/routes/materials.ts` serves the business reads and writes. The
  primary routes follow the HTTP API design (`GET /api/materials`,
  `POST /api/materials`); `GET /api/materials:list` and `GET /api/materials:get`
  are kept as compatibility aliases for the QA probes.
- `server/ai/` registers the `materials-assistant` employee and its
  read-only `search-materials` tool. The tool authorizes inside the call against
  `ctx.actor`, so an asker only ever gets rows their own `view` decision selects.

## Access model

`app.materials` is a composite resource with `view` / `create` / `edit` /
`delete`. Two permission sets are seeded by `MaterialsAccessProvider`:

| Set                    | Assigned to           | Grants                                              |
| ---------------------- | --------------------- | --------------------------------------------------- |
| `materials.employee`   | `authenticated:*`     | page `materials`; `view` scoped to non-confidential |
| `materials.supervisor` | the seeded supervisor | page `materials`; all four actions on all records   |

`confidential` is set only by the seed and is never writable, so no API request
can widen or narrow who may read a row.

## Demonstration accounts

`MaterialsAccessProvider.boot()` provisions these idempotently, without
resetting a password or role an administrator has since changed:

| Username     | Password        | Role                                          |
| ------------ | --------------- | --------------------------------------------- |
| `supervisor` | `supervisor123` | supervisor — reads A/B/C, maintains materials |
| `colleague`  | `colleague123`  | ordinary colleague — reads A/B only           |

The built-in `nocobase` / `admin123` root account also works and is
unrestricted; any account created through the UI is an ordinary reader.

## Verification

`tests/logic/app-server.test.ts` ("serves the materials feature …") boots the
real standalone server with the seeded database and asserts the whole model:
anonymous is 401, a colleague sees 2 rows, the confidential row is 404 by id,
the supervisor sees 3, and the composite snapshot carries the actions the page
gates on.
