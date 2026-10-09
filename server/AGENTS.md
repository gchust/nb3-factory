# Server — 设备售后服务与巡检协同系统

This directory carries the application's own HTTP surface and the business
service behind it. Read `../AGENTS.md` and
`../.agents/skills/nocobase-app-development/` first; this file only records the
decisions that are not obvious from the framework docs.

## Layout

- `service/ticket-service.ts` — the domain service (create, accept, reject,
  files, messages, dashboard, inspections, reminders, assistant). It never
  reads a Hono context and never returns an HTTP status.
- `service/timestamps.ts` — `stamped`/`createdAtStamp`/`touched`.
- `service/scalars.ts` — `coerceText` for repository scalars.
- `service-authorization.ts` — the four permission sets and every page/record
  grant.
- `routes/` — one factory per area, mounted by `routes/index.ts`.
- `middleware/equipment-service.ts` — the `/api/ticketAttachments/*` session
  gate and the `/uploads/tickets/*` read guard, composed in `server/app.ts`.
- `providers/` — `EquipmentServiceProvider` (service + authorization),
  `EquipmentSchedulerProvider` (scheduled work), `EquipmentWorkflowProvider`
  (acceptance workflow activation).

## Things a future edit must keep in step

### Timestamps are not automatic

NocoBase 3 does not manage `createdAt`/`updatedAt`. Every application
create/update must set them, as **ISO strings** (the datetime fields are typed
`string`, and a `Date` fails type checking and the SQLite `NOT NULL`
constraint). Use `service/timestamps.ts`; do not hand-roll them.

### Authorization needs a record-access rule

A read/update/delete grant must name a record-access rule (`recordAccess`) or
it is denied with `NO_RECORD_ACCESS`; only `create` works with a bare field
list. Route-level checks call `policyFor(app, collection, authorization)`
**without** an operation argument — passing a custom resource/action makes the
composite policy miss the collection grant and answer 403.

### The acceptance workflow and its shared token

Acceptance runs through the source-managed workflow in
`workflows/ticket-acceptance/` (triggered by `TicketService.requestAcceptance`).

A repeated acceptance decision is a no-op, not a second run. `requestAcceptance`
checks the ticket's state first and answers `already-accepted` (or
`already-refused`) without triggering the workflow, and `recordStep` keeps one
row per `(eventKey, status)`. The public recovery path for a genuine acceptance
failure is the ticket-detail **Accept** action plus the workflow run record —
there is deliberately no separate retry endpoint. A failed step is recorded
with `status: 'failed'`; re-issuing the acceptance retries it. Do not delete an
acceptance log or a message row to make a retry look successful.

Workflow handler modules are materialized into `storage/workflows/<key>/<digest>/`
and the runtime **refuses to load a module that resolves outside its artifact**,
and bare package imports are not reliably resolvable from that copy. Handlers
therefore may not import application `server/` code. `TicketService` is shared
with them through a process-global token:

```ts
// server/service/ticket-service.ts          and   workflows/.../server/tokens.ts
Symbol.for('equipment-service/service.ticket');
```

Both sides must use that **same literal string**. (Two `createServiceToken('x')`
calls produce different keys, and a `Map` keyed by token identity would not
resolve across the two copies.) Change one side and the other breaks.

A materialized workflow revision is created `enabled: false` and is not
`current` by default. `EquipmentWorkflowProvider` materializes and enables the
current `ticket-acceptance` revision on every boot, so a rebuild with a new
digest activates the new artifact without a manual step.

### Seeds import server code, so source runs need `tsx`

`database/main/seeds/202610010010_service_test_data.ts` imports
`server/*.js`, which names a `.ts` file in a source checkout. `pnpm dev` and
`pnpm nocobase` already run under `tsx`; a test that boots the application from
source and runs seeds must register it itself
(`tests/logic/app-server.test.ts`, `tests/logic/service-equipment.test.ts`).

### AI features are honest about what is unconfigured

The device manual sync (`POST /service/manuals/:id/sync`) and the service
assistant answer from accessible tickets, published knowledge articles and
manuals even when no LLM service, vector database or embedding model is
configured. The LLM-generated answer path is skipped and the response reports
`generated: false` / `mode: 'retrieval'` with an explanatory note, rather than
fabricating an answer. A query only ever cites records the signed-in user may
read (the retrieval runs through the ticket record scope); it returns a
suggested `resolutionNoteDraft` and never writes the ticket. Saving the draft
is an explicit user action, and closing stays a separate confirmed step.

### Observers read a summary, never internal records

A read-only observer may see an approved, non-confidential ticket summary and
nothing else. The handling log, the share list and the repair attachments are
internal: `GET /service/tickets/:id` returns `access: 'summary'` with those
sections empty, and `GET .../logs`, `.../shares`, `.../attachments` answer 403.
The `/uploads/tickets/<id>.<ext>` byte route runs through
`TicketService.canViewFileId`, which requires internal (owner, creator,
supervisor or active share) access, so a shared address does not leak the
bytes. The record-access rule `service.ticketsObserver` is
`observerVisible AND NOT confidential` — the two conditions must be combined
with `allOf`, not the OR of `anyScope`.

### Attachment content is verified before it becomes a ticket file

The file plugin stores any bytes and only enforces a size limit (413
`BODY_TOO_LARGE`). `POST /service/tickets/:id/attachments` therefore calls
`TicketService.assertAttachmentContent`, which reads the stored bytes through
the Drive disk and refuses a file whose content does not match its format
(PNG signature for `photo`, ZIP/DOCX signature for `report`). The rejected
record and its stored object are removed, and the route answers 400 with
`reason: 'SERVICE_ATTACHMENT_CONTENT_INVALID'`. The browser repeats the same
check in `validateAttachmentFile` before uploading; that is a convenience, not
the enforcement.
