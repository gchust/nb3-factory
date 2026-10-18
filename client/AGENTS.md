# Client notes

## Device ledger (设备台账)

The ledger lives at `/devices` (`client/pages/devices/`), declared in `client/routes.ts` with two child routes so the
create and edit dialogs open over the list and survive a refresh:

- `devices` — `client/pages/devices/index.tsx`, the list. It loads one page of `devices` (`pageSize: 100`), filters by
  status through the URL (`?status=available|borrowed`), and sorts and paginates in the browser. When `meta.total`
  exceeds the fetched rows it shows `devices.capNotice` instead of pretending the list is complete.
- `devices/new` — `client/pages/devices/new.tsx`, a `RouteDialog` around `DeviceForm`.
- `devices/edit/:deviceId` — `client/pages/devices/edit.tsx`, which loads the current record, then renders the same
  `DeviceForm` with `device` set (so the form issues `PATCH`).

`DeviceForm` (`client/pages/devices/device-form.tsx`) is shared by both dialogs and owns only fields, validation and
submission; the container owns the title, footer and open/close. Its zod schema is built inside the component from
`t()`, so validation messages follow the selected language. A duplicate code comes back as `409` with reason
`DEVICE_CODE_TAKEN` and is mapped onto the code field via `form.setError`; it is never shown as the backend's English
message. `DeviceStatusBadge` (`status-badge.tsx`) maps a status to a shared `StatusBadge` tone and a translated label.

Device `name` and `code` are user-entered content. They are stored and displayed as-is and are never translated.

The list refreshes after a save through the `DevicesOutletContext` the page passes to its `Outlet`; keep that context
memoized or the child routes' effects will re-run.

## Copy and language

All user-visible strings are keys in `client/locales/en-US.ts` and `client/locales/zh-CN.ts`; the devices copy lives
under the `devices` group plus `navigation.devices`, `actions.create`/`actions.saving`/`actions.signInAgain` and
`status.sessionExpired`. `tests/logic/app-locale-coverage.test.ts` fails if a key used in `client/` is missing from
either locale. The selected language is persisted per browser by `@nocobase/app-client` under `nocobase.locale` in
`localStorage`, so it survives a refresh and is not shared between users.

## Shared components added here

`client/components/session-expired-alert.tsx` is the shared "your session ended, sign in again" alert; the devices
list and form both use it instead of writing their own.

## Tests

`tests/components/devices.test.tsx` renders the real list and form inside `TestI18nProvider` with
`@nocobase/app-client` and `@nocobase/app-plugin-authentication/client` mocked: it covers the localized table and
empty states, the status filter read from and cleared through the URL, the row action's edit link, the ended-session
alert, required-field validation in English and Chinese, and the `409 DEVICE_CODE_TAKEN` mapping into translated copy
(not the backend message).
