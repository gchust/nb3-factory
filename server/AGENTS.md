# Server notes — project collaboration

The domain logic of project collaboration lives in `providers/projects.ts`; the HTTP surface is
`routes/collaboration.ts` and `routes/deliverable-files.ts`. This file records the rules a future change has to keep.

## Layers

- **`providers/projects.ts`** — `projectsServiceToken` / `createProjectsService(databaseManager)`. It owns every read
  and write, the membership and ownership checks, the milestone-completion guard, and the deliverable review and share
  rules. It throws `ProjectCollaborationError` (status + `UPPER_SNAKE_CASE` reason) and never touches Hono or HTTP.
- **`routes/schemas.ts`** — zod input/output schemas for the routes.
- **`routes/collaboration.ts`** — the `/api` routes. `auth.required()` is installed on each path prefix the router
  owns; the service decides membership. A `ProjectCollaborationError` is mapped to an `ApiError` in the router's
  `onError`, so routes never build an error body by hand. `toApiError` is exported for the one other route that can
  throw the same domain error (below).
- **`routes/deliverable-files.ts`** — `POST /api/deliverableFiles/upload` (multipart, one `file`) and the root route
  `GET /deliverables/:id/content`. The content route is application-owned on purpose: the file plugin serves anyone
  holding a UUID, which contradicts "shared with a colleague until the share is revoked". Access is decided by
  `service.assertDeliverableContentAccess` before the disk is touched. Because it is a **root** route it does not
  share the `/api` router's error handling, so it runs the error through `toApiError` itself; without that, a
  `PERMISSION_DENIED` from the access check reached `apiErrorHandler` unrecognized and surfaced as an opaque 500.

## Rules encoded in the service

- Membership is the only way to see a project. `requireMembership` answers `PERMISSION_DENIED`
  (`PROJECT_ACCESS_DENIED`) for a non-member, and it runs before the project is loaded, so a non-member cannot tell an
  existing project from an unknown one. `NOT_FOUND` (`PROJECT_NOT_FOUND`) is only reachable once access is allowed.
- Only the owner may add or remove members, create/edit/delete milestones, complete a milestone, delete a task, or
  accept/reject a deliverable. `requireOwner` answers `PROJECT_OWNER_REQUIRED`; the owner cannot be removed.
- A task is updatable by the owner in full and by its assignee for `status` only (`TASK_UPDATE_DENIED` otherwise).
- A milestone cannot complete while any `required` task under it is unfinished
  (`FAILED_PRECONDITION` / `MILESTONE_HAS_UNFINISHED_TASKS`). Completing it stamps `completedAt`.
- Submitting a deliverable moves its task to `pending_acceptance`; accepting moves it to `completed`; rejecting
  requires a non-empty reason (`REJECTION_REASON_REQUIRED`) and moves it back to `in_progress`.
- A deliverable's file may be shared by its submitter or the project owner, with an active share granted to a
  colleague; the grant is unique per `(deliverableId, sharedWithId)` (`DELIVERABLE_SHARE_EXISTS`) and revoking it
  removes content access again.

## Data conventions

- **No database defaults and no automatic timestamps.** Every write sets `createdAt`/`updatedAt` itself (the
  `touch()` helper) and every seed does too. The migration declares them `notNull` with no default; the db layer does
  not fill them in.
- **User columns are plain strings**, with no foreign key to `user`. Names are resolved on read through
  `database.repository('user')` and fall back to a neutral label when the user is gone. This keeps the collaboration
  tables independent of the authentication plugin's schema.
- Ids are `crypto.randomUUID()`.

## Reminders

`providers/project-reminders.ts` registers one recurring job on the `jobExecutorServiceToken`'s schedule executor,
scope `project-collaboration`, cron `0 1 * * *`. Each run sends one in-app notification per overdue task, keyed
`overdue-task:<taskId>:<date>` for idempotency, and is a no-op when no `notificationServiceToken` is registered (the
dedicated tests or a trimmed deployment). The schedule is `immediately: true` as well as daily: the first firing at job
creation reminds the overdue work a fresh install or a deployment already has instead of staying silent until 01:00,
and the daily idempotency key keeps later restarts from repeating it. It is not the Scheduler plugin: this is a fixed
internal cron, not something an administrator schedules in the UI.

The messages target the `inbox` Channel, which `server/config/notification.ts` maps to the notification-in-app plugin's
`in-app` Provider. That mapping is required — the previous empty `notification.channels` made every send fail with an
unknown Channel and the reminder was silently dropped. `client/pages/notifications.tsx` (the App route
`/notifications`) is the production inbox surface; the plugin only ships a development-only one.

## Verification

`tests/logic/project-collaboration-api.test.ts` starts the real application on a test database and drives the whole
flow, including the content route's 403 (rather than 500) for a member without a share and the overdue reminder that
reaches the assignee's in-app inbox. `tests/logic/project-collaboration-migration.test.ts` checks the migration and its
rollback. Both need `AUTH_SECRET` in the environment (the test sets it) and the app test pins
`APP_PUBLIC_ORIGIN=http://localhost` because cookie-authenticated writes are refused unless their `Origin` is trusted.
The content route is a root route, so its test builds the request against `testApp.publicBasePath` rather than through
the API-scoped `session.fetch`.
