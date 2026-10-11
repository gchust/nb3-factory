# IT service desk (client)

The application is an IT service desk. Its pages live in `client/pages/` and are declared in `client/routes.ts`.

- `/` is the dashboard (`pages/home/`): pending, overdue, and each engineer's workload. `authz: 'skip'` so every signed-in user can land there.
- `/tickets` is the list shared by every role, with `new` and `:ticketId` children (`pages/tickets/`). The server scopes each role's rows, so the page needs no page authorization; `authz: 'skip'` keeps it reachable for regular employees.
- `/team` (`pages/team/`) assigns the `engineer` / `serviceDesk` roles. It is `authz: 'unrestricted'`: only root may open it, and the endpoints enforce the same rule.

## Components

- `client/components/data-table/` is the app's Data Table (shadcn `table` + `@tanstack/react-table`). It is imported as `#components/data-table`; that specifier has its own entry in `package.json#imports` pointing at the directory index. `useReactTable` carries a deliberate `react-hooks/incompatible-library` disable — TanStack Table's return value is not memoizable and that is expected.
- `client/components/session-expired-alert.tsx` is the shared "sign in again" alert used when an API call answers 401.
- `client/layouts/components/header-actions.tsx` renders `InboxEntry` before the theme and account menus. It uses the notification-in-app plugin's `useInboxUnreadCount()` (so it needs the `QueryClientProvider` the runtime provides), puts the count on the shared `InboxButton`, and links to the app-owned `/inbox` route. That route (declared in `client/routes.ts`, rendered by `pages/inbox.tsx`) is what makes an assignment or resolution notification clickable through to `/tickets/:id`.

## Ticket actions

One `TicketActionDialog` (`pages/tickets/detail/action-dialog.tsx`) renders assign/process/resolve/return/close/comment. The detail page remounts it with a `key` that changes per action instead of resetting its fields in an effect; keep that, because synchronous `setState` in an effect is a lint error here.

## Text

Application copy is in `client/locales/{en-US,zh-CN}.ts` under dotted keys (`dashboard.*`, `tickets.*`, `team.*`, `navigation.*`). A group written in the app locale file replaces the system group of the same name, so a shared group is spread first: `navigation: { ...systemEnUS.navigation, tickets: '...' }`. Write copy here, never in `client/locales/system/`, which a template upgrade replaces.
