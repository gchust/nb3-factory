# Client notes

Application-owned guidance for `client/`. The root `AGENTS.md` is template-owned and
restored on a template upgrade; this file records what this application adds on top of it.

## Device ledger (`/devices`)

The device ledger is the application's own feature. It is a list page with a create
dialog and an edit dialog, all declared in `client/routes.ts` under one `devices` route
(`auth: 'required'`, `authz: 'skip'`, navigation `navigation.devices`, icon `HardDrive`):

- `client/pages/devices/index.tsx` — the list. It asks the endpoint for the largest page
  (`PAGE_SIZE = 100`) and sorts/paginates in the browser. The status filter lives in the
  URL (`?status=available|borrowed`) through `useSearchParams`, so a refresh, a back
  navigation and a shared link all restore it. `changeStatus()` writes it with
  `{ replace: true }`; `isDeviceStatus()` in `types.ts` guards the param.
- `client/pages/devices/new.tsx` — the create dialog, a child route at `new`.
- `client/pages/devices/edit.tsx` — the edit dialog, a child route at `edit/:deviceId`.
  It loads the latest record by id before rendering the form and calls the list's
  `onNotFound()` on a 404.
- `client/pages/devices/device-form.tsx` — the shared form. Omitting `device` means
  create (`POST`); passing it means edit (`PATCH`). Its zod schema is built with `t()`
  inside the component so validation messages follow the current language. A duplicate
  code (409 `DEVICE_CODE_TAKEN`) is set as the `code` field error; 401 becomes a
  `SessionExpiredAlert`; 403 and other failures become a form-level alert.
- `client/pages/devices/status-badge.tsx` — the translated status badge, using the shared
  `StatusBadge` tones (`available` → success, `borrowed` → warning).

Both dialogs get the list's `reload`/`onSaved`/`onNotFound` through `<Outlet context>`
(`DevicesOutletContext` in `types.ts`); the list owns reloading, the dialogs never fetch
the list themselves.

The list is built on `client/components/data-table/` (with the sibling barrel
`client/components/data-table.ts`), following shadcn's Data Table guide on
`@tanstack/react-table` and the `table` primitive. Reuse that component for other lists
rather than hand-writing a `Table`.

## Text and languages

Every user-visible string goes through a key in `client/locales/en-US.ts` and
`client/locales/zh-CN.ts`; the devices copy lives under `devices.*`. Never put device
data (a code, a name) through `t()` — user-entered data is shown as entered and is not
translated. Only system statuses (`devices.status.available|borrowed`) are translated.

The application offers exactly `en-US` and `zh-CN` (`client/locales/index.ts`). The
language picker in `client/layouts/components/language-switcher.tsx` stores the choice
in the browser, so it persists across refreshes and is not shared between users or
concurrent sessions. Do not add a server-side language preference.
