# Database

The application's own schema and installation data. Everything here is application-owned source; the template only
ships the empty directories and the permission initialization.

## The document library (资料库)

Three Collections, created by `migrations/202610200001_create_material_library.ts`:

| Collection           | Holds                                                                    |
| -------------------- | ------------------------------------------------------------------------ |
| `materials`          | One material: `title`, `body`, `ownerId`, `published`, `confidential`    |
| `materialShares`     | A temporary per-record read grant: `materialId` + `userId`               |
| `libraryMemberRoles` | A person's work role: `editor` keeps materials, `reader` only reads them |

`materials.id` is a UUID string, because the API exposes material ids as strings. The `ownerId`/`userId` columns hold
the Better Auth `user.id` as a plain string rather than a relation: the authentication plugin owns the user table and
the library must not depend on its internal shape.

Field names in a migration are logical (`ownerId`); the physical column is snake_case (`owner_id`). `query`
(Kysely-style) and the Collection builder both take the logical name, so code never writes a physical one.

## Installation data

`seeds/202610200002_library_seed.ts` is a **required** seed, not a sample: `pnpm nocobase db apply` loads it and the
application is delivered with this data already present. The QA scenario is defined in terms of these exact records, so
the seed must load without `APP_SAMPLE_DATA=true`.

Accounts and credentials — the same as the acceptance scenario names, documented here so an operator can sign in:

| Person   | Username | Password    | Library role |
| -------- | -------- | ----------- | ------------ |
| 资料员甲 | `jia`    | `jia123456` | `editor`     |
| 阅读者乙 | `yiyi`   | `yi123456`  | `reader`     |

The username is `yiyi`, not `yi`: the authentication plugin enforces a three-character minimum.

Materials, identified by a stable `reference`:

| Reference    | Title      | Flags                    |
| ------------ | ---------- | ------------------------ |
| `material-p` | 公开资料 P | published                |
| `material-d` | 内部草稿 D | draft (unpublished)      |
| `material-c` | 机密资料 C | published + confidential |

## Rules

- A migration is immutable history and self-contained. Spell out every field, index and constraint in it; never
  import a definition that keeps evolving. Once its branch is merged, correct it with a new migration.
- Seeds never create structure, and every write is `INSERT`-only-if-absent (`ensureUser`/`ensureRole`/`ensureMaterial`).
  Re-running the seed after somebody edited a title, changed a role or shared a draft must leave that work untouched.
- `collections/` is generated output — `pnpm nocobase collections generate` writes it, it is gitignored, and it is
  never read back or imported from a migration. Never edit it by hand.
- Demo/sample data that is not required to run goes in a seed declared `sample: true`, or on `sampleDataToken`; this
  seed is deliberately not one of those.
