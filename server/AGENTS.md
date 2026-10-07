# Server application notes

These notes record choices this application makes that the template's guidance does not decide. Read them together
with the root `AGENTS.md` and the synchronized Skills under `.agents/skills/`.

## Document Center (issue #652)

The business feature lives in `server/providers/document-center.ts` (the service and its provider),
`server/providers/document-retrieval.ts` (pure retrieval, no database), `server/routes/documents.ts` (the employee
surface) and `server/routes/admin.ts` (departments, membership, the user directory and backups). Schema and demo data
are `database/main/migrations/20260101000001-create-document-center.ts` and
`database/main/seeds/20260101000002-seed-document-center.ts`.

Decisions worth knowing before changing it:

- **Documents are text, not files.** `documents.content` holds markdown/text; there is no attachment, no
  `documentChunks` collection and no embedding store. The client downloads a `.md`/`.txt` file it builds from the
  content the endpoint returned. An answer cites a paragraph of the current version, split in memory.
- **Q&A is deterministic keyword retrieval, not an LLM.** `document-retrieval.ts` tokenizes CJK as bigrams (unigrams
  when a run is one character) and ASCII as words, scores paragraphs, and returns the paragraphs that clear
  `MIN_SCORE`. It never receives a document the asker may not read: the service filters by visibility first, so the
  permission boundary is enforced before retrieval. Do not add a title bonus or an LLM path without revisiting the
  "must not cite what the asker cannot read" test.
- **Employee visibility is enforced in the service, not by query filters.** `listDocuments` and `getDocument` load
  candidate rows and apply `status='published'`, `deletedAt IS NULL` and the department rule in JavaScript. The SQL
  stays simple equality; keep the filtering out of the query builder so the rule has one implementation.
- **Repository returns temporal fields as strings on SQLite.** `@nocobase/db` decodes `datetime`/`datetimeTz` to the
  portable string contract, so a value read back is not a `Date`. Never call `.getTime()` or `.toISOString()` on a
  field straight from a row: normalize with `toDate` / `toNullableDate` from `document-center.ts` first. This was a
  real production bug caught by the backup tests; the same trap applies anywhere the app reads a timestamp.
- **Versions are append-only.** Creating a document writes version 1; editing inserts a new version row and bumps
  `documents.version`; restoring an old version copies that content into a new version rather than rewriting history;
  deleting is soft (`deletedAt` / `deletedById`) and restoring clears both.
- **A version carries its modifier's name.** `listVersions` resolves the author's display name from the `user`
  collection and returns it as `createdByName`, so a reader without the `manage` action sees who changed a version
  without the administrator-only `/directoryUsers` endpoint being requested. Only the accounts that authored this
  document's versions are revealed; the directory itself stays behind `manage`.
- **A backup is a full snapshot of the center.** `buildSnapshot()` collects departments, documents (with their
  department links) and versions; restoring clears and reinserts, matching departments by `code`. The restore route
  requires `confirm: true` and the client shows the impact first. Treat the snapshot shape as a compatibility surface:
  bump `schemaVersion` when it changes.
- **One administration action.** The console is gated by the `documentCenter` settings item and a single `manage`
  action; `requireManage()` in `server/routes/shared.ts` checks it per route. The employee routes require only a
  session. Keep `requireManage()` on each admin route or sub-router, never on a router mounted at `/api`, whose
  wildcard leaks into contributions mounted later.

## Tests

Change-scoped tests live in `tests/logic/document-center-*.test.ts`, `tests/logic/document-retrieval.test.ts` and
`tests/components/document-center-pages.test.tsx`. The API test starts the real standalone application, so a
cookie-authenticated write must carry a trusted `Origin`; it is configured in that file rather than by weakening the
CSRF check.
