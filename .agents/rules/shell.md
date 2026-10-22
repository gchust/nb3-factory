# Application shell

Read this before changing the layouts, header, sidebar, breadcrumbs, account menu or loading indicators under `client/layouts/`, `client/routing/` and `client/components/`.

## Breadcrumbs and layouts

Layouts own breadcrumb route context and render the current page's trail in the header after the sidebar toggle (`client/components/breadcrumbs.tsx`): the route trail by default, or the trail a page declares with `usePageBreadcrumb` from `@nocobase/app-client` when it names records. Pages do not render breadcrumbs themselves. `AppRouter` selects routes and layouts. See [pages and routes](../skills/nocobase-app-development/references/frontend/references/page.md) for each layout's scope.

## Header and sidebar

`client/layouts/components/layout-header.tsx` is a presentation container accepting children. The sidebar is shadcn's Sidebar: `components/app-sidebar.tsx` wraps its provider, desktop icon mode and phone sheet, and `components/navigation-menu.tsx` draws the permission-filtered route tree with `SidebarMenu*`: a top-level group with no page of its own is a section, its entries always shown under a `SidebarGroupLabel` heading, while clickable parents and nested groups are controlled `Collapsible` sub-menus, and an item `client/lib/navigation-transform.ts` marks `section` deeper in the tree is a heading over its direct links inside that menu; a count beside an entry, such as unread items, is passed by the App layout in `NavigationMenu`'s `badges`, keyed by route name. Keep `client/components/ui/sidebar.tsx` as the shadcn CLI writes it except for removing its unused origin-wide `sidebar_state` cookie write; persistence belongs to the application-scoped preference. Customize from outside: widths go through the provider's `style` in spacing units, the phone sheet is rendered in `app-sidebar.tsx` with a translated title, and the provider's Ctrl/Cmd+B shortcut is stopped at `document`. The App layout owns menus, branding, permissions and redirects. Desktop icon mode hides top-level section headings and keeps their entries' icons, shows leaf labels as zero-delay tooltips and opens groups in hover and keyboard-focus popovers, preserving filtered navigation, parent-page links, nested groups and the selected group's highlight. Keep this behavior aligned across layouts. Desktop collapse state is shared through `useSidebarPreference` at `nocobase:sidebar:collapsed:app:<basename>` across layouts and tabs of the same application. `createApp(runtime)` provides a stable store using `runtime.basename`, with only empty/root and boundary slashes normalized; paths and case remain intact. Missing new keys default to expanded without migrating the old shared preference; whether the phone sheet is open stays local to each layout.

The header carries no Settings or Inbox entry. An application has no separate settings area: a page that configures something is an ordinary route in `client/routes.ts` with `navigation`, placed in the sidebar like any other page, for example under a Settings navigation group. The `/inbox` page declares no navigation; give it an entry where the application wants one.

`client/lib/navigation-transform.ts` is the application-owned hook for customizing the permission-filtered navigation tree. The shared sidebar supports static section labels with direct links as well as collapsible groups.

Navigation groups retain their expanded or collapsed state while the navigation tree stays mounted. Selecting a new page expands its ancestor groups without collapsing other groups; users can still collapse the active group manually.

## Account menu and session

The account menu checks Better Auth sign-out results before refreshing the session and shows a localized error toast for API or network failures. Preserve this behavior when upgrading the shell; navigation alone does not revoke a session.

The authorization provider clears the permission snapshot before rendering a new session. Route navigation and page guards subscribe to the authorization revision; preserve these checks when customizing the shell so account changes and permission updates take effect without a reload. Pending checks hide protected content, and failed checks deny access.

The account menu language control in `client/layouts/components/language-switcher.tsx` uses a shadcn submenu with radio items. Render it inside `DropdownMenuContent` to preserve menu keyboard navigation and selection semantics.

## Branded loading

Use `Loading` for page or panel waits and `Spinner` (the shadcn-compatible adapter to `BrandSpinner`) for inline pending actions, uploads, and refresh indicators. Both share the stable NocoBase mark and orbit animation; do not introduce independent Lucide spinners for application loading. Keep skeletons for content placeholders and progress bars for determinate progress. `index.html` has the matching pre-JavaScript mark and must stay visually consistent. All animations respect reduced motion.

The shared list of shell behaviors to keep when customizing is in [customizing the shell](../skills/nocobase-app-development/references/frontend/references/shell.md).

The signed-in region waits in `client/routing/session-preparation.tsx` before mounting `AppLayout`: the authentication provider first reconnects active realtime subscriptions as the current session and waits for the open notification, including permission invalidation. A ten-second timeout shows a localized retry/sign-out screen. Keep this boundary inside `RequiredAuthentication`; guest login must remain reachable without realtime. Readiness is only for initial session preparation. Subsequent permission notifications and reconnects still use normal fail-closed route unmounting, including portal and effect cleanup.

## Realtime-unavailable fallback

`createApp` enables `allowRealtimeUnavailable` on `AppRouter`. It is an application-level availability choice, not a change to the shell's default: when the realtime channel cannot open within the preparation timeout, the application mounts through HTTP authorization and shows a fixed status banner with a retry that reloads the document. The reload also releases a socket stuck in `CONNECTING`. Authorization is still resolved over HTTP by the authorization provider; the fallback never skips permission checks. The default (`false`) keeps the fail-closed retry/sign-out screen for the shell tests and for any caller that does not opt in. This matters because a WebSocket can stay `CONNECTING` indefinitely when a proxy, browser profile, or connection pool prevents the upgrade; HTTP and the application remain healthy while the preparation boundary would otherwise block every business page.
