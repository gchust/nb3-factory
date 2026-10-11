# IT service desk (server)

The ticket feature is application-owned: a migration, an app-owned collection set, a service, `/api` routes, and example data. It is deliberately not a plugin.

## Files

- `server/providers/it-tickets/service.ts` — `ItTicketService` (the state machine, role scoping, notifications, dashboard, overdue scan). Exports `itTicketServiceToken`.
- `server/providers/it-tickets/provider.ts` — binds the service and schedules the overdue reminder job every 15 minutes.
- `server/providers/it-tickets/sample-data.ts` — the demo users and tickets, registered on `sampleDataToken`, built only when the database was installed with `APP_SAMPLE_DATA=true`.
- `server/routes/it-tickets.ts` and `server/routes/it-ticket-files.ts` — the HTTP surface; `server/routes/schemas.ts` holds the response schemas.
- `server/routes/it-ticket-files.ts` also owns attachment _content_ validation. The file plugin stores whatever bytes arrive and trusts the caller's `type`, so `validateAttachmentUpload` reads the multipart body from a clone (leaving the request intact for the plugin's own size limit and parser) and refuses anything that is not a real PNG/JPEG/GIF/WebP/BMP by magic number, and non-`image/*` types. A rejected upload answers `400 TICKET_UNSUPPORTED_ATTACHMENT`.

## Things that are easy to get wrong here

- **Job scope must be package-shaped.** `@nocobase/jobs` rejects a scope containing `:` or a second `/`. The reminder job uses `@nb3-factory/it-tickets`; `app/it-tickets` throws at startup.
- **A cookie-authenticated write needs a trusted origin.** `auth.required()` runs Better Auth's CSRF check, so a write whose `Origin`/`Referer` is not the app's own origin is refused with `403 INVALID_CSRF_ORIGIN`. Production sets `APP_PUBLIC_ORIGIN`; the integration test sets it too.
- **The service is HTTP-free.** Its `ItTicketError` carries a numeric status for classification; the routes translate it to an AIP status. A service `409` (closed ticket / invalid state) becomes `FAILED_PRECONDITION`, i.e. HTTP `400`, so those routes declare `400`. Keep the route's `toApiError` and the declared responses in step.
- **Roles are the app-owned `itTeamMembers` table**, not permission sets: `userId` plus `engineer` or `serviceDesk`. Root users count as service desk. Scoping is enforced in the service, and the `/api` routes only require a session.
- **Demo users need a `username`.** Better Auth's `sign-in/username` looks users up by `username`, so an account created without one cannot sign in. The demo usernames are `zhang.san`, `li.si`, `wang.wu`, `zhao.liu`; the shared password is `DEMO_PASSWORD` in `sample-data.ts`.
- **Overdue** means: not `closed` and not `resolved`, untouched for over 24 hours, and not reminded in the last 24 hours. The scan stamps `remindedAt` and notifies the service desk.

## Example data

`pnpm nocobase db sample` (development) loads what an install skipped. Running it again is safe: it checks for each user, team row, and any existing ticket before creating anything.
