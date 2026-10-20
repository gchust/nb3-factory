# Client notes

## Device ledger

- `/devices` is a signed-in business page, not a settings page. Its route and the `new` / `edit/:deviceId` dialog routes live in `client/routes.ts` with `authz: 'skip'`; keep the page id stable because stored page grants reference it.
- The list keeps `status`, `page`, and `pageSize` in the URL. Links into the dialogs carry the current search so closing a dialog returns to the same filtered list.
- Device records expose `code`, `name`, `status` (`available` | `borrowed`), and optional `notes`. Treat names and notes as user data: render them exactly as stored and never add them to translation files.
- `client/pages/devices/device-form.tsx` owns create/edit validation and maps the server reason `DEVICE_CODE_TAKEN` onto the code field. Server reasons are stable identifiers; visible text comes from `client/locales/{en-US,zh-CN}.ts`.
- The edit dialog route is the child route `edit/:deviceId`, so its link is `/devices/edit/<id>`, not `/devices/<id>/edit`. Keep the list link and the route declaration in sync.
- `tests/components/devices.test.tsx` covers localized list/empty states and URL-preserving links. `tests/logic/client-routes.test.ts` checks the route declarations.
