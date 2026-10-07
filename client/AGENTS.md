# Client notes — project collaboration

This application's own feature is project collaboration: projects with members, milestones, tasks, deliverable
acceptance, and a personal dashboard. This file records what a future agent needs to know before changing it.

## Where it lives

- `pages/projects/` — the list, the create form, the project detail, and the task drawer.
  - `types.ts` mirrors the server's view types; keep it in step with `server/providers/projects.ts`.
  - `format.ts` — plain formatting helpers plus `collaboratorName` and `deliverableContentUrl` (`resolveAppUrl`).
    It must stay free of JSX so it can be imported from anywhere without a react-refresh warning.
  - `forms.tsx` — `ProjectForm`, `AddMemberDialog`, `MilestoneDialog`, `TaskDialog`, `SubmitDeliverableForm`.
  - `deliverables.tsx` — the reject/share/preview surfaces built on `DeliverableCard`/`DeliverableList`.
  - `use-remote-data.ts` — `useRemoteData<T>(path)` returning `{ data, error, loading, reload }`.
- `pages/home.tsx` — the dashboard (progress, metrics, personal todos).
- `pages/notifications.tsx` — the notification center (App route `/notifications`). It wraps the notification-in-app
  plugin's `NotificationInAppProvider` and `NotificationInAppInbox`; the plugin ships only a **development-only**
  inbox page, so this is the production surface the overdue-task reminders land on. The server scopes the inbox to the
  session user, so the route declares `authz: 'skip'` like the project pages.
- `components/session-expired-alert.tsx` — shown in place of a failed dialog when the API answers 401.
- `routes.ts` — the route declarations; `locales/*` — every user-visible string.

## Decisions worth keeping

- **Authorization is server-side.** Project access is membership, so the pages declare `authz: 'skip'` and the server
  checks membership on every request. Do not add page grants that duplicate membership rows; they drift. The client
  decides what to show from the role the API returns (`project.myRole === 'owner'`, `task.canUpdate`,
  `deliverable.canReview`, `deliverable.canSubmitterShare`) rather than from a local permission check.
- **Native `<input type="date">` instead of `@nocobase/date-picker`.** The library's date field needs `date-fns` and
  `react-day-picker` linked at the top level, which the template does not do; pulling them in is churn for two due
  dates. The native control matches the same `YYYY-MM-DD` string the API stores. If a richer picker is wanted later,
  add `@nocobase/date-time-picker` with the shadcn CLI and replace the inputs in `forms.tsx`.
- **Forms use react-hook-form + zod** (`@hookform/resolvers/zod`) and share the `FormDialog` base, which owns the
  footer, the submit button's pending state, and the session-expired alert. Validation messages live under
  `projects.form.*`. `TaskDialog` is mounted once by the list and reused for every row, so it cannot rely on
  `defaultValues` alone (those apply only at mount); it resets the form from `taskFormValues(task)` whenever it opens.
  Keep that `useEffect` when changing the dialog, or the edit form will show empty fields for a reused instance.
- **Data loading is page-local.** `useRemoteData` has no shared cache; each page owns its request and reloads after a
  mutation. It derives `loading` from a `Settled<T>` record rather than setting state in the effect body (the
  `react-hooks/set-state-in-effect` rule). Keep that shape if you change it.
- **Route shape.** `/projects` is the list; `/projects/new` is a `RouteDialog` child of it. `/projects/:projectId` is a
  **sibling** top-level route (not a child of the list) so the detail replaces the list; `/projects/new` still wins
  because React Router ranks a static segment above a dynamic one. `/projects/:projectId/tasks/:taskId` is a
  `RouteDrawer` child of the detail. Parents render `<Outlet />` themselves. The task drawer reads its task from the
  detail's `Outlet` context (`ProjectDetailOutletContext`) instead of re-fetching.
- **Small dialogs are local, not routes.** The reject reason, share picker, file preview and confirm dialogs use the
  `Dialog` primitive directly; only surfaces that deserve a URL are route overlays.
- **Files are custom UI.** The file plugin's `FileUploadField`/`FilePreviewDialog` need the plugin's client upload
  route, which this application does not register. Upload goes through `POST /api/deliverableFiles/upload`; content is
  served by the application's own authenticated `/deliverables/:id/content` route. `file-view.tsx` renders images
  inline, PDFs and text in an `iframe`, and everything else as a download link.
- **Session expiry is surfaced, not swallowed.** `isSessionExpired(error)` turns a 401 into `SessionExpiredAlert`,
  whose button refreshes the session through `useAuthentication().refresh`.

## i18n

Every string is a key. `projects.*` covers the feature, `home.*` the dashboard, `navigation.projects` and
`navigation.notifications` the menu entries, and `status.sessionExpired` / `status.sessionExpiredDescription` /
`actions.signInAgain` the expired-session alert. `en-US.ts` and `zh-CN.ts` must stay in exactly the same shape; a
missing key in `zh-CN.ts` is a compile error.
