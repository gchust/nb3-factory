# Server

Application-owned server code. Everything under `server/` belongs to this application, not to a plugin: edit it directly. This file documents the document-library feature; keep it beside the code it describes when the feature changes.

## Document library

A small internal document library. `pnpm nocobase db apply` seeds three accounts and three documents:

| Account   | Username    | Password       | Role                                       |
| --------- | ----------- | -------------- | ------------------------------------------ |
| Librarian | `librarian` | `librarian123` | Owns and maintains their own documents     |
| Reader    | `reader`    | `reader123`    | Read-only                                  |
| Admin     | (existing)  | (existing)     | Root; adjusts work permissions and sharing |

The three documents are all owned by the librarian: 公开资料 P (published, non-confidential), 私有草稿 D (draft) and 保密资料 C (published, confidential).

### Where it lives

- `server/library/resources.ts` — the `libraryDocuments` Collection declaration and the `library.documents` composite resource: its data scopes, the four business actions, and the read/create/update/delete field permissions. Portable: no database access, no services, so both the provider and the seeds reuse it.
- `server/library/record-access.ts` — the `defineRecordAccess` resolvers that compile each data scope into a filter.
- `server/providers/library.ts` — registers the Collection with the authorization database, defines the composite and its scopes, and places the business actions in the Admin UI.
- `server/routes/library.ts` — the REST endpoints under `library/documents`.
- `server/routes/schemas.ts` — the zod schemas the endpoints validate and document with.
- `database/main/migrations/202610100001_create_library_documents.ts` — the `library_documents` table.
- `database/main/seeds/2026101000*.ts` — the two accounts, the three documents, the `library.editor`/`library.reader` permission sets, their assignments, and the reader's confidentiality restriction rule.

### Business rules

- A document has a `title`, `body`, `ownerId`, a `published` flag and a `confidential` flag. `id`, `ownerId` and the timestamps are written by the server, never named by the request body.
- The librarian may read, create, edit and delete their own documents. The reader may read only published, non-confidential documents and may not write at all.
- A reader never sees a confidential document, even when an administrator shares that exact record with them. Confidentiality is a restriction rule assigned directly to the reader (`library.reader.hide-confidential`); sharing rules add rows and restriction rules subtract them, so the intersection hides `C`.
- An administrator shares a single draft with the reader through a sharing rule. Revoking it removes the row on the next request; nothing is cached on the client.
- "Read" is not "edit": the reader's permission set grants only `view`, so the server marks every row they can see with `canEdit`/`canDelete` `false`, and a write is refused with `403` before the input is validated.

### Authorization model

The endpoints never compare ownership in a handler. Each request resolves the caller's Collection policy for the business action and binds it to the Repository, so rows, fields and relations are enforced in SQL:

```ts
authorization.database.policyFor(LIBRARY_COLLECTION, context.get('authz'), {
  resource: 'library.documents',
  action: 'view',
});
```

`documentsAccess()` runs before `apiValidator()`, so an unauthorized caller is denied before the shape of the input is revealed. `library.owned` and `library.readable` resolve to `false` for a principal that is not a user.

Data scopes registered for the permission screens:

| Scope                     | Row filter               | Offered for             |
| ------------------------- | ------------------------ | ----------------------- |
| `library.owned`           | `ownerId` = current user | view/edit/delete        |
| `library.published`       | `published = true`       | view                    |
| `library.readable`        | published, or owned      | view                    |
| `library.nonConfidential` | `confidential = false`   | view (restriction rule) |
| `allRecords`              | every row                | create (default)        |

A write's Repository policy is the caller's _view_ policy with the operation's own permission swapped in, so `createOne`/`updateOne` can read back the row they wrote without returning one the caller could not `GET`.

### Endpoints

| Method | Path                                 | Action | Notes                                                                                   |
| ------ | ------------------------------------ | ------ | --------------------------------------------------------------------------------------- |
| GET    | `/api/library/documents`             | view   | `?page=&pageSize=`; returns `meta.canCreate` so the client knows whether to offer "New" |
| POST   | `/api/library/documents`             | create | writes `id` (UUID), `ownerId` and the timestamps                                        |
| GET    | `/api/library/documents/:documentId` | view   | `404` when the row is outside the read scope                                            |
| PATCH  | `/api/library/documents/:documentId` | edit   | rejects a body that names no updatable field with `400`                                 |
| DELETE | `/api/library/documents/:documentId` | delete | `204`; `404` when the row is outside the delete scope                                   |

Each route declares itself with `describeRoute()`; the running application lists them under the `Library` tag in `<origin><APP_BASE_PATH>/api/swagger/docs`.

### Seeds

The seeds are idempotent and skip a row that already exists, so an administrator's later edit is not overwritten. Permission-set and restriction-rule rows are hand-serialized rather than built through the running application, so a fresh install and an upgrade produce the same data. Their titles are stored as translation keys (`library.permissionSets.editor`, `library.permissionSets.reader`, `library.restriction.hideConfidential`) resolved in the `nb3-factory` locale files, so the permission screens render them in the current language.

### Verifying

`tests/logic/library.test.ts` boots a real application, signs in the three accounts and covers the rules above. `tests/components/library-page.test.tsx` covers the list page's rendering and its permission-gated actions. To reproduce the rules by hand against the development database, apply the seeds and call the endpoints with a session cookie for `librarian` and `reader`.
