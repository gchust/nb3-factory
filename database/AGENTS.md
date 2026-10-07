# Database notes — project collaboration

Everything the collaboration feature owns is created by one migration and one seed in `main/`.

- `../main/migrations/20260115090001_create_project_collaboration.ts` creates `projects`, `project_members`,
  `milestones`, `tasks`, `deliverables`, `deliverable_shares` and `deliverable_files`. It is self-contained: every
  column, index and foreign key is spelled out here, so it never changes meaning when a later migration runs. Once it
  has been applied anywhere, an edit to this file does nothing but break its checksum — a correction is a new
  migration, and while this branch is unmerged `pnpm nocobase db redo` re-applies it.
- `../main/seeds/20261215090002_seed_project_collaboration_sample.ts` installs the sample project and the colleague
  `李四` (`admin123`). It runs only when `projects` is empty and a `user` exists, and it picks the earliest-created
  user as the project owner, so a fresh `pnpm nocobase db apply` with the authentication seed already run gives the
  work to the default administrator. It is idempotent: a second run is a no-op.
- **User references are plain string columns with no foreign key to `user`.** Names are resolved on read in
  `server/providers/projects.ts`. Do not add a foreign key without a migration that handles the existing rows.
- **Timestamps are explicit.** `createdAt`/`updatedAt` are `notNull` with no default, so every seed insert must set
  them; the server service does the same. `deliverable_files` mirrors the file plugin's row shape so the plugin's
  server repository can write it.

See `tests/logic/project-collaboration-migration.test.ts` for the schema assertions and the rollback check.
