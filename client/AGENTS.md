# Service desk client notes

This application is an internal IT service desk: an employee raises a repair ticket, the service desk assigns it to an
engineer, the engineer handles it, and the employee confirms the result to close it or returns it for more work. These
notes record the decisions behind the browser half so a later change does not undo them by accident. The server half
is in `server/AGENTS.md`; the workflow itself is `报修到确认关闭`.

## Where the feature lives

```
client/pages/home/index.tsx                 the overview dashboard (replaces the template homepage)
client/pages/tickets/index.tsx              the list
client/pages/tickets/new.tsx                the raise dialog (child route of the list)
client/pages/tickets/detail/index.tsx       the record page (covering child page of the list)
client/pages/tickets/detail/{assign,reassign,resolve,return,cancel}.tsx   the five input dialogs
client/pages/tickets/ticket-form.tsx        the raise form
client/pages/tickets/transitions.tsx        the transition dialog + the direct-transition button
client/pages/tickets/shared.tsx             state/urgency badges and the summary field
client/pages/tickets/attachments.tsx        read-only attachment previews on the record page
client/pages/tickets/types.ts               shared route/outlet types and TRANSITION_ORDER
client/pages/settings/service-desk/index.tsx  staff management
client/hooks/service-desk.ts                the whole `/api/serviceDesk` client surface
client/hooks/api-error-message.ts           request id + user-facing text of a failed request
client/hooks/use-transition-text.ts         a transition's label/title/description by name
client/hooks/use-date-time.ts               a localized date-and-time formatter
```

`client/hooks/service-desk.ts` is the **only** place the client describes `/api/serviceDesk`: the response types, the
request functions and the `useApiResource`-based hooks. Keep its types in step with `server/routes/schemas.ts`. It
defines its own `ApiQuery` type because `@nocobase/api-client` is not a direct dependency of the application, so
importing from it here would be a phantom dependency.

## The route tree

`client/routes.ts` declares the pages; the dialog routes are children of the record page and the raise dialog is a
child of the list. Read the comments there before moving a route.

- `/tickets` renders the list and an `Outlet` for the raise dialog. `/tickets/new` is a `RouteDialog`; it closes to
  the list through `reload(); void close()` and reports busy state through refs so `beforeClose` reads a synchronous
  value.
- `/tickets/:ticketId` is a **covering child page** (`RouteChildPage`), not a dialog or a drawer, because a ticket has
  a description, notes and history that do not fit a modal. It declares **no `breadcrumb`**, so it carries a
  `BackButton` above its heading (guideline L6) rather than both.
- The five input transitions (`assign`, `reassign`, `resolve`, `return`, `cancel`) are child routes of the record
  page rendered by `RouteDialog`. The record page renders its deeper `<Outlet context={outletContext} />` **beside**
  `RouteChildPage`, not inside it, so the dialogs anchor to the content area the same way it does.
- Ticket pages are `authz: 'skip'`; the server enforces visibility and every write. `settings/service-desk` is the
  one page with a real page grant (`service-desk-settings`). `tests/logic/client-routes.test.ts` pins all of this.

## Actions come from the lifecycle, never from a state check

The record page derives its buttons from `view.available` filtered by `allowed`, ordered by `TRANSITION_ORDER` from
`client/pages/tickets/types.ts`. `TRANSITION_ORDER` yields the natural single primary action per state (submitted →
assign, assigned → start, processing → resolve, returned → reassign, resolved → confirm) while `return` and `cancel`
stay secondary; `cancel` sits behind the "…" `DropdownMenu` (guideline L2: one primary action per view). A transition
that needs input is a link to its child route; `start`, `rework` and `confirm` fire directly through
`DirectTransitionButton`. Do not reintroduce a hard-coded `if (status === …)` for what is shown — the server and the
browser would then disagree the moment a guard changes.

## Data loading

Everything reads through `useApiClient` and the `useApiResource` helper in `client/hooks/service-desk.ts`. It keeps
the previous batch across a reload or a failure, hides the error of an in-flight request until it settles, and treats
an empty key as "do not load" — the list uses that to wait for `/me` before its first request, and the settings page
to load the staff list only for a helpdesk member. Do not replace it with `useState`/`useEffect` that clears data on
each load; the list and the settings page rely on the previous rows staying visible.

A failed read is shown through `RequestFailed` (`client/components/request-failed.tsx`), which is the application's
own addition beyond the two worked-example files: a 401 becomes `SessionExpiredAlert` and everything else keeps a
retry. A refused transition reports the server's own bilingual message through `useApiErrorMessage()`.

## Two files are copied unchanged from the frontend handbook

`client/components/session-expired-alert.tsx` and `client/hooks/use-url-search.ts` are the shared infrastructure the
handbook ships complete; keep them as the handbook has them so a template upgrade can carry a fix. `RequestFailed`
and the three `client/hooks/` helpers above are the application's own; `api-error-message.ts` and
`use-transition-text.ts` live in their own files because `react-refresh/only-export-components` forbids exporting a
hook from a file that also exports a component.

## Attachments

Attachments go through the file plugin and `client/extensions/nocobase-file-component-ui`. `FileUploadField` is
inherently controlled, so the raise form holds only `attachmentIds: string[]` in react-hook-form state and keeps the
uploaded `FileRecord`s in `useState`. The record page reads them back with `TicketAttachments`, which uses the client
file repository manager and re-sorts the rows into the stored id order.

## Copy

Every user-visible string is a `serviceDesk.*`, `navigation.*`, `actions.*` or `status.*` key in
`client/locales/en-US.ts` and `zh-CN.ts`; the coverage test scans the literals used in `client/**`. The system's
`status.*` copy is a set of flat dotted keys, so `'status.sessionExpired'` is declared flat rather than nested.
Transition wording is named by a literal `t()` call per transition in `use-transition-text.ts` so the scanner sees it.
