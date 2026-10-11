# Client notes for this application

## Materials pages

- Routes in `client/routes.ts`: `/materials` (list), `/materials/new` (create), `/materials/:materialId` (detail/edit). All three are `auth: 'required'` with `authz: 'skip'` — access is enforced by the server API, not by the page guard, so a signed-in colleague can open the list and correctly sees an empty one.
- Pages live in `client/pages/materials/`. `index.tsx` keeps the list mounted and renders `<Outlet />`, so `new` and `detail` are covering `RouteChildPage` routes that return to the list with `BackButton`.
- Data access is in `client/pages/materials/types.ts` through `useApiClient()`; uploads go through `clientFileRepositoryManagerToken.repository('materialFiles')` (the file plugin exposure declared in `server/routes/material-files.ts`).
- Files upload before the form saves, so a save rejected for a missing title keeps the uploaded files and the user only has to add the title. Do not re-upload on retry.
- Attachment bytes are owner-scoped by `server/middleware/material-access.ts`; the `contentUrl` returned by the API is the only URL the client uses. Never build a storage URL directly.
- User-visible strings are the `materials.*` keys plus `auth.demoAccounts*` in `client/locales/en-US.ts` and `client/locales/zh-CN.ts`.

## Corrupt-file honesty

`client/extensions/nocobase-file-component-ui/` is application-owned (synchronized from the NocoBase UI Library, then editable). Its `previewers/file-preview-content.tsx` reports a failed image decode through an explicit message instead of leaving a broken image or claiming a preview succeeded, and `components/file-thumbnail.tsx` falls back to an icon. A corrupt PNG must never look like a successful preview. `tests/components/file-preview.test.tsx` covers the non-image paths; keep the image behavior intact.

## Shell

`tests/logic/client-shell.test.tsx` asserts the desktop navigation's `data-state` after a toggle. The preference is shared through a DOM event (`client/layouts/use-sidebar-preference.ts`), so the assertion waits for the DOM update rather than assuming the click flushed it. Keep that wait; the synchronous form is flaky under a loaded full-suite run.
