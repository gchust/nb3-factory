# Client notes

## Device ledger

`client/pages/devices/` is the application-owned device ledger. It is registered in `client/routes.ts` as route
`devices` (`/devices`, navigation title `navigation.devices`, icon `HardDrive`, `auth: 'required'`, `authz: 'skip'`)
because the issue requires every signed-in user to read and edit devices. The page loads through
`client/pages/devices/device-client.ts`, a thin wrapper over `useApiClient`; no data provider is registered and no
refine resource is declared.

Copy for the feature lives under `devices.*` in `client/locales/en-US.ts` and `client/locales/zh-CN.ts`. Two rules the
feature depends on:

- System values (`devices.status.available` / `devices.status.borrowed`) are translated; user-entered device names and
  notes are rendered exactly as typed and never passed through a translator.
- The server returns a stable `reason` (`DEVICE_CODE_TAKEN`, `DEVICE_NOT_FOUND`), and
  `client/pages/devices/error-message.ts` maps it to a translated message. Never render `ApiClientError.message`, which
  is a developer string; see the HTTP API guidance on error handling.

## `systemSettingsRoutes` is registered

`client/routes.ts` now registers the prepared `client/pages/settings/routes.ts` in addition to the application routes.
The bare template is Home-only, but AGENTS.md requires the Users/Roles administration surfaces once the application
has a business capability, because an administrator has to be able to create the ordinary users who use the ledger.
This is the intentional difference from the bare template, and `tests/logic/client-routes.test.ts` pins it.

Do not remove that registration, and reconcile it on every iteration: when a new capability adds settings, register
its real administration surface here rather than hiding the whole settings tree. The device ledger itself needs no
page grant, so it stays `authz: 'skip'`; only the settings pages name a resource and action.
