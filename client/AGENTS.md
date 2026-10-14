# Client

Application pages live in `client/pages/`, are declared in `client/routes.ts`, and take their copy from
`client/locales/`. Shared components live in `client/components/`; the library's own pieces stay in
`client/pages/library/`.

## The document library (资料库)

| Route            | Page                       | Authorization        |
| ---------------- | -------------------------- | -------------------- |
| `/materials`     | `pages/library/index.tsx`  | `skip` (any session) |
| `/materials/:id` | `pages/library/detail.tsx` | `skip` (any session) |
| `/library-admin` | `pages/library/admin.tsx`  | `unrestricted`       |

`skip` is deliberate: reading the library is open to every signed-in person, and the server enforces what each one
may read. The admin page is `unrestricted`, so only a root session sees it in the sidebar.

Files in `pages/library/`:

- `api.ts` — `LibraryClient`, the typed wrapper over `/api/library/...`, plus `isUnauthorized`/`isForbidden`/
  `isNotFound` and `errorMessage`. Ids are strings throughout.
- `use-library.ts` — `useLibraryClient()` (a memoized client over `useApiClient()`) and
  `useSessionExpiredRedirect(error)`.
- `components.tsx` — `MaterialBadges`, `Toggle`, `MaterialFormDialog`, `ShareDialog`.
- `index.tsx`, `detail.tsx`, `admin.tsx` — the three pages, each a default export.

The material detail page is a sibling route of the list (`/materials/:materialId`), not a child, so a refresh or a
direct URL works. `BackButton` takes an explicit `to='/materials'` for the same reason: `..` would resolve to `/`.

### Session expiry

`useSessionExpiredRedirect` watches for a `401` and does a **full page reload** to `/login`
(`window.location.assign(resolveAppUrl('/login'))`). Navigating within the running SPA would keep the stale session in
memory and loop; the reload is what clears it. Account changes and permission updates are picked up the same way the
rest of the shell picks them up.

### Data loading

Each page loads with local `useState`/`useEffect` plus a `version` counter for reloads. Keep it that way for
predictability; the shared hooks are only `useLibraryClient` and `useSessionExpiredRedirect`.

### Writing text

Every user-visible string is a key in `client/locales/en-US.ts` and `client/locales/zh-CN.ts`, under the `library` and
`navigation` groups. `en-US.ts` states the wording and derives the shape the other locale is checked against; adding a
key there without its `zh-CN` counterpart is a compile error. Never edit `client/locales/system/`, which a template
upgrade replaces.

### Components and styling

Compose the shadcn primitives in `client/components/ui/` and use the semantic Tailwind tokens
(`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`). Do not hard-code colors.
Use `StatusBadge` for status labels and `Loading` for waits. Keep the library looking like the rest of the
application — a different look on one page is a defect, not a customization.
