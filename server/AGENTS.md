# Server — application notes

## Document library (资料库)

The feature is four files plus one route and one provider registration:

- `library-resources.ts` — the shared contract: the collection name, the
  composite resource id `library.documents`, the translation-key helper, the
  `LibraryDocumentRow` shape, and the three record-access scopes
  (`libraryOwned`, `libraryVisible`, `libraryNonConfidential`) plus the
  composite resource builder. `libraryVisible` is the union of owned, published
  and non-confidential, and shared records; `libraryOwned` is the owner match.
- `library-service.ts` — the domain layer. It does not read a Hono context and
  does not authorize itself: the route resolves the composite decision once and
  hands the resulting `RepositoryPolicy` to every repository call.
- `providers/library.ts` — binds `libraryServiceToken`, publishes the
  collection, record-access definitions and composite resource to the
  authorization workspace, and places them in its UI. Its `boot()` returns
  early when the authorization plugin is absent so a minimal runtime without it
  still starts.
- `routes/library.ts` + `routes/schemas.ts` — the HTTP layer at
  `/api/library/documents`.

Decisions a future change has to keep in mind:

- **Custom routes, not repository routes.** A create body must not be able to
  choose `ownerId`; the handler takes it from the authenticated principal and
  the body schema is a strict object that rejects `ownerId`. A repository route
  would let a client spoof ownership.
- **Authorize before validating.** Each route runs `authorize(action)` in
  middleware ahead of `apiValidator`, so an actor without the operation gets
  403 before a malformed body can produce 400.
- **`id` is a string (uuid).** Sharing rules select records by string id, and
  the repository filter validator rejects a string against an integer field, so
  an auto-increment primary key could never be shared. The service writes
  `crypto.randomUUID()` and `'id'` is in `CREATE_FIELDS` so the create policy
  permits it.
- **Confidentiality is a restriction, not a filter in the query.** The
  `library.nonConfidential` restriction rule is assigned to the reader only.
  Restrictions narrow grants plus sharing, so a confidential document shared
  with the reader still answers 404, while the owner and the administrator keep
  their access. Do not move this into the visibility scope — that would widen it
  instead of narrowing it.
- **Seeds are self-contained.** `database/main/seeds/*` run both from source
  (under Node's native TypeScript loader, which resolves only specifiers that
  literally exist on disk) and from the compiled output. They inline their data
  rather than importing `database/seed-data` modules, and they intentionally
  cannot import `server/library-resources.ts`. Keep them self-contained.
- **Deactivation** is the authentication plugin's job; no library code is
  involved. A disabled account's existing session is rejected on the next
  request.
