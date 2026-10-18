# Database notes

Application-owned notes for migrations and seeds. The template's guidance is in the repository-root `AGENTS.md`.

## The materials schema

`database/main/migrations/202610070001_create_materials.ts` creates `materials` (title, body, ownerId, published,
confidential, timestamps) and `materialShares` (a unique `(materialId, userId)` pair). The unique index is the mechanism
that makes sharing idempotent: sharing the same material with the same person twice conflicts instead of adding a
duplicate. A migration is immutable history — correct an applied one with a new migration, and use
`pnpm nocobase db redo` only while its branch is unmerged.

## Seeds

Three seeds run in a fixed order on a plain install:

1. `202610070005_materials_test_accounts.ts` — the two test accounts `material_jia` (资料员甲) and `material_yi`
   (阅读者乙). Better Auth requires usernames of at least three characters.
2. `202610070010_materials_permission_configuration.ts` — the `material-editor` / `material-reader` permission sets,
   their assignment to the two accounts, and the `materials.confidentiality` restriction rule.
3. `202610070020_materials_sample_records.ts` — 公开资料 P, 私有草稿 D and 保密资料 C, all owned by 甲.

These are **regular seeds, not `sample: true`**: the acceptance criteria are written against this dataset, so it must be
present on a fresh install without `APP_SAMPLE_DATA`. That is a deliberate departure from the template's default for
demonstration data. Keep them idempotent and reproducible — fixed identity values, no timestamps or random values in
identifying fields, and never overwrite a value a user may have edited. The records are what an administrator would
otherwise create by hand, so a seed that changes them after the fact would be a surprise.

**Seeds must be self-contained.** `@nocobase/db` loads a seed through native `import()`, which rewrites only the
top-level module URL; a relative import inside a seed fails with `ERR_MODULE_NOT_FOUND` under the test runner. Keep the
literal data inside the seed file and import only bare packages (`@nocobase/db`, `better-auth/crypto`).

`tests/logic/materials-seeds.test.ts` asserts the exact seeded set, so changing a seed without changing that test fails
the build.

## Query notes

Physical columns are snake_case (`owner_id`, `created_at`) mapped to logical camelCase. Query builders must call
`.execute()` — a builder without it compiles and never runs. Boolean filters use `$isTruly` / `$isFalsy`; `$eq true`
is not a registered boolean operator.
