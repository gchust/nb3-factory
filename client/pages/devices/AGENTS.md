# Devices (设备台账)

The device ledger: after signing in a user views the devices, adds one, edits one, and filters the list by status. A
device has exactly `code`, `name` and `status`; `status` is `available` or `borrowed`. There is no delete route and no
approval or reservation flow.

## Files

```text
client/pages/devices/index.tsx        list page; declares the whole feature's routes as its children
client/pages/devices/new.tsx          create dialog, a child route of the list
client/pages/devices/edit.tsx         edit dialog, a child route of the list
client/pages/devices/device-form.tsx  the fields, validation and submission, shared by both dialogs
client/pages/devices/status-badge.tsx chooses a StatusBadge tone for a status value
client/pages/devices/types.ts         Device, DeviceStatus and the status list
```

## Patterns to keep

- **A form owns fields, validation and submission only.** `DeviceForm` renders no title, no buttons and no dialog.
  The dialog (or page) around it owns those, puts the submit button outside the `<form>` and links it with `formId`.
  The device form id is per dialog: `device-new-form` and `device-edit-form`.
- **The status filter lives in the URL** (`/devices?status=borrowed`), not in component state, so a refresh and a shared
  link keep the filter, and the row-actions Edit link can carry it back. Filtering the current page's rows is not
  enough once the list grows; the request sends `status` to the server.
- **Server values stay untranslated on the wire.** The stored status is `available`/`borrowed`; only its label is
  translated, through `devices.status.<value>`. A device's `code` and `name` are user text and are never translated.
- **Validation messages are translated.** Client-side messages come from `devices.form.*`; an error the server refuses
  is mapped from its `reason` (`DEVICE_CODE_TAKEN`, `DEVICE_NOT_FOUND`) to a translated `devices.errors.*` message.
  Never render `ApiClientError.reason` or `.message` to a user.
- **A 401 is an ended session, not a retryable failure.** Render `#components/session-expired-alert` so the user can
  sign in again; use an `Alert` with a retry only for other failures.
- **Lists use the shared `#components/data-table`**, built on TanStack Table, with the toolbar supplied through its
  `toolbar` render prop.

## Data access

The page loads and writes through `useApiClient()` against the application's own `/api/devices` routes (see
`server/routes/devices.ts`). It does not read the collection through a data-provider/Refine resource. The API contract
is documented at `/api/swagger`; keep the page and that document in step when a field changes.
