# Server application notes

## Internal document library (资料库)

`materials` and `materialShares` are application-owned tables. The feature is a
custom REST API under `/api/materials`, not the built-in data API or the
authorization plugin's policy engine, because the read rule has a
document-specific exception (a temporary share) that the plugin cannot express.

- `database/main/migrations/202609100001_create_material_tables.ts` owns the
  schema. `database/main/seeds/202609100002_seed_material_demo.ts` seeds the
  demo permission sets (`curator`, `reader`), the two accounts (甲/乙) and the
  three demo documents.
- `server/providers/materials-service.ts` holds the domain logic and the pure
  `canReadMaterial` / `canWriteMaterial` rules; it is the only place access is
  decided. `server/providers/materials.ts` binds it to `materialServiceToken`.
- `server/routes/materials.ts` is the HTTP layer. It installs
  `authentication.required()` on its own sub-router and maps `MaterialError`
  to `ApiError`, so an unreadable document (missing, revoked, confidential)
  and an unshared draft all answer `404` rather than leaking existence.
- Working roles are read from `authorizationPermissionSetAssignments` by the
  set keys `root`/`curator`/`reader`. They are ordinary permission sets, so an
  administrator adjusts them from Settings → Users without a code change.

Read behaviour (owner = `materials.ownerId`): root reads everything; the owner
reads their own document in any state; a confidential document is unreadable by
anyone but the owner or root even when shared; a share opens exactly that one
otherwise-unreadable draft; otherwise a published, non-confidential document is
readable by any signed-in user with a working role. Reading never grants
writing: only root, or a `curator` who owns the document, may write.
