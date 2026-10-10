# Client notes — equipment after-sales service

These notes describe decisions this application made on top of the template.
The root `AGENTS.md` is template guidance restored on publish, so app-specific
rules belong here.

## Pages and routes

- App pages are declared in `client/routes.ts` under `defineAppRoutes()`. The
  navigation group title is `service.navigation.title`.
- Create, edit and record detail are **URL-addressable child routes**, not a
  modal opened from a list. The child component returns `RouteDialog` for a
  short form and `RouteDrawer` for a record page (see
  `client/pages/orders/create.tsx`, `client/pages/orders/detail/index.tsx`); the
  parent page renders the `Outlet` through
  `client/components/service/outlet-context.ts`.
- `/assistant` uses `auth: 'required'` with `authz: 'skip'`: the AI service
  assistant is available to any signed-in user and has no page grant.

## Data access

- Pages load through `useServiceResource` (`client/hooks/use-service-resource.ts`)
  and the shared `ApiClient`; never build a URL by hand. File bytes go through
  `resolveAppUrl`.
- **List filters and search are component-local state, not URL query
  parameters.** Keep it that way so a filter does not enter browser history or
  the shareable URL.
- `DirectoryUser` and the other response shapes live in
  `client/api/service-types.ts` (re-exported from `client/api/service.ts`) so
  either import path works.

## UI

- **Tables are hand-built semantic tables** (`client/components/service/service-table.tsx`);
  `@nocobase/data-table` is not installed. Column alignment is the logical
  `'start' | 'end'`, never `'right'`.
- Shared service components live in `client/components/service/`
  (`service-table`, `detail-list`, `status-badge`, `form-field`, `feedback`,
  `outlet-context`). Reuse them so spacing and states stay consistent.
- Action buttons are gated with
  `useCan({ resource: { type: 'composite', id: 'service.<module>' }, action: '…' })`.
- Lists render loading, error and empty states explicitly; never draw an empty
  table for a failed request.
- The order share panel (`client/pages/orders/detail/shares.tsx`) compares a
  share's expiry against a clock captured at mount instead of calling
  `Date.now()` while rendering, which `react-hooks/purity` rejects. The label is
  cosmetic: the server enforces the live expiry on every read.
- Style with semantic Tailwind tokens (`bg-background`, `text-muted-foreground`,
  `border-border`, …) so the light and dark themes both work.

## The AI service assistant page

`client/pages/assistant/index.tsx` reports what is actually available. The
employee and its order-lookup tool are registered on the server, but the chat
surface and a configured model service are not part of this application. The
page reads that from the server and shows the real status instead of drawing a
conversation box that could not answer. Do not replace it with a chat UI until
a chat surface and a model service exist.

## Text

- Every user-visible string goes through `useTranslation()` and exists in both
  `client/locales/en-US.ts` and `client/locales/zh-CN.ts`. A missing key in
  `zh-CN.ts` is a compile error.
- Feature copy uses the `service.*` prefix and does not repeat the plugin
  namespace.
