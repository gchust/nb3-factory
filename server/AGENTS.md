# Server notes for `nb3-factory`

Everything below is this application's own feature code. The root `AGENTS.md` is
the template's guidance and is replaced on upgrade; keep application-specific
notes like these in this file.

## Document library (资料库)

The application's one business feature. Read `server/library/` in this order:

- `domain.ts` — the `LibraryDocument` shape as the service returns it.
- `authorization.ts` — the composite resource `library.documents` (actions
  `view`, `create`, `edit`), the two Record Accesses that the Permission Sets
  reference (`library.published`, `library.notConfidential`), and the scope keys
  of the Sharing Rules this application writes.
- `service.ts` — reads and writes through `databaseManagerToken`; it decides
  what the caller may do (through the authorizer) and returns `editable` /
  `canShare` / `canCreate` with every record so the client does not guess.
- `provider.ts` — registers the Record Accesses and binds
  `documentLibraryToken`.

`server/routes/library/document-routes.ts` is the HTTP surface. It mounts under
`/api`, so **every declared path starts with `/library`**. Each route installs
`auth.required()`, `authorization.middleware()`, and `requireAction(...)`, and
declares itself with `describeRoute()`.

### Invariants that are easy to break

- **Authorization is the intersection the framework already computes.** The
  reader's Permission Set grants `view` with the `library.published` Record
  Access; the Restriction Rule `library.reader.notConfidential` is intersected
  after any Sharing Rule expands the scope. A confidential document therefore
  stays invisible to 乙 even while a share names it. Do not replace this with a
  hand-written `if (confidential)` in the service — that would remove the
  `restrict`/`expand` ordering the review depends on.
- **A share grants `view` only.** Never add `edit` to a sharing rule: the
  requirement is that reading a shared draft never carries editing with it.
- **`filter-builder` boolean fields accept only `$isTruly` / `$isFalsy`.** A
  record access that passes `$eq` for `published` fails at request time with
  `FIELD_CAPABILITY_NOT_SUPPORTED`.
- **Authorization rule and permission-set `title` columns are JSON-encoded.**
  A seed that inserts them with raw SQL must `JSON.stringify(title)`; the store
  decodes with `JSON.parse`.
- **Seeds are immutable history and cannot import each other's modules.** The
  database task loads them as raw ESM, so a relative `import './some-other-seed.js'`
  fails. Repeat the small constants (`jia`, `duzhe`, the document ids) inside
  each seed.
- **`defineSeed({ transaction: false })`** is deliberate: the seeds write to
  tables owned by other packages and re-run idempotently.

### Verifying

- `pnpm exec vitest run tests/logic/library-api.test.ts` starts the whole
  application on a test database and signs in as 甲, 乙 and the administrator.
  It covers anonymous `401`, the reader's `403` on a write, `404` for a document
  outside the caller's scope, sharing, revoking, the confidential restriction,
  and deactivating the reader.
- `pnpm exec vitest run tests/logic/library-migration.test.ts` applies and rolls
  back the documents migration against a real database.
- Against a running application, the interactive document is at
  `<APP_BASE_PATH>/api/swagger/docs`.
