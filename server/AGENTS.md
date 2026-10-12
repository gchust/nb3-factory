# Server notes

Application-owned notes for the server side. The template's guidance is in the repository-root `AGENTS.md`.

## The materials feature

`server/materials/` and `server/providers/materials/` implement internal materials reading and temporary sharing.

- `server/materials/constants.ts` — page id, collection names, permission-set and record-access names. Change an id here
  rather than in a literal, because it also identifies stored grants.
- `server/materials/record-access.ts` — the two named record-access resolvers the grants refer to.
  `materials.readable` = `confidential = false AND (published = true OR id IN the requester's shares)`, and
  `materials.confidentiality` = `confidential = false OR ownerId = requester`. Boolean columns use `$isTruly` /
  `$isFalsy`, never `$eq true` / `$eq false`: the equality operators are not registered for booleans and the request
  fails at the database layer.
- `server/materials/grants.ts` — the permission sets, built as plain `database.collection` grants with
  `policyFor`-style field and record-access lists. `material-editor` reads/creates/updates/deletes **only what it owns**
  (`recordsIOwn`); `material-reader` only reads through `materials.readable`. The create scope is intentionally always
  `true` so the service can set `ownerId` from the requester instead of trusting the body.
- `server/providers/materials/{index,service}.ts` — the service, bound to its own token. It decorates records with the
  owner's name and derives the capability flags the list returns.
- `server/routes/materials.ts` — the `/api/materials` endpoints. All require a session; sharing requires the
  `materials.sharing` settings permission, which only root has. Every route owns its own authentication and permission
  middleware; do not rely on registration order.
- `server/routes/schemas.ts` — the zod schemas and response declarations behind `/api/swagger`.

**Sharing is not a permission change.** `material_shares` is a table the application owns, and the readable
record-access resolver consults it. That is why revoking a share takes effect on the next request — including a refresh
of a detail page the reader already had open — with no session or cache to invalidate. Sharing a confidential material
grants nothing, because `materials.readable` still excludes it, and a second restriction rule makes that explicit.
`materials.confidentiality` is assigned to the reader permission set as defense in depth, so an accidental future grant
cannot expose a confidential row.

## Where this departs from a hand-built permission check

The authorization plugin owns the model (permission sets, record access, restriction rules); this application supplies
only the collections, the named resolvers and the seeds that assign the sets. Do not replace it with ad-hoc `if`
checks in the routes: the same record access must apply to any future read path, and the admin UI manages the
assignments.
