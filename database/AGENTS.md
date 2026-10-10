# database notes

## Migrations

- `database/main/migrations/` is immutable history. A migration spells out every field, index and constraint
  itself and never imports a declaration that keeps evolving, so an already-applied migration can never change
  meaning. `202610100001_create_knowledge_documents.ts` creates the `knowledgeDocuments` collection.
- `database/main/collections/` is generated (`pnpm nocobase collections generate`) and never edited by hand.

## Seeds

- Seeds are idempotent and hold reproducible data. The knowledge seeds use a fixed `SEEDED_AT` and look up by a
  stable key (`title`, `username`, permission-set `key`) before inserting, so re-running is a no-op and a
  user-edited document is never overwritten. Do not introduce `Date.now()` or random values into identifying
  fields.
- `202610100002_knowledge_documents.ts` inserts the three documents; `202610100003_knowledge_accounts.ts` creates the
  two isolated test accounts; `202610100004_knowledge_permissions.ts` creates the `knowledge-supervisor` and
  `knowledge-colleague` permission sets and assigns the accounts to them. The supervisor set reads and manages all
  documents and holds both page grants; the colleague set reads only `knowledge.publicDocuments` and holds both page
  grants. Neither set is root.

## Relative imports inside seeds name the `.ts` source

The seed loader imports a seed file **directly with Node**, not through the application bundler, and Node does not
map a `.js` specifier onto a `.ts` file on disk. A relative import of application source inside a seed must
therefore name the file that actually exists:

```ts
import { DOCUMENT_VISIBILITY } from '../../../server/knowledge-resources.ts';
```

`allowImportingTsExtensions` and `rewriteRelativeImportExtensions` are set in the shared server tsconfig, so the
compiler rewrites the specifier to `.js` for the build — the compiled seed and a `pnpm nocobase db apply` both work.
Using `.js` here works only while a TypeScript loader (tsx) is active; it fails in an in-process test that loads the
seed with plain Node, and in any other native-Node consumer.
