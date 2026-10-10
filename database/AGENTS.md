# Database application notes

- `database/main/migrations/` and `database/main/seeds/` are application-owned.
  The first migration creates the `materials` and `materialShares` tables; the
  first seed creates the `curator` / `reader` permission sets, the 甲/乙
  accounts and the three demo documents. See `server/AGENTS.md` for the access
  rule they belong to.
- `database/main/collections/` is generated output. Regenerate it with
  `pnpm nocobase collections generate`; never edit it by hand and never import
  it from a migration or seed.
