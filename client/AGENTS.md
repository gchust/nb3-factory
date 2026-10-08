# Client — 设备售后服务与巡检协同系统

The application adds an **Equipment After-Sales Service & Inspection** module
under the `/service` route prefix. Nothing here is a plugin; it is this
application's own pages.

## Pages and route ids

All pages are declared in `client/routes.ts` under one `service` group
(`/service`). Each page declares `authz` with a page id `service.<name>`; the
same ids are stored on page grants and must stay in step with
`SERVICE_PAGES` in `server/service-authorization.ts`. A nested record page with
no `authz` of its own inherits its nearest ancestor page's id, so the ticket
record page is authorized as `service.tickets`.

- `service-dashboard` `/service` — counters
- `service-customers`, `service-devices`
- `service-tickets` `/service/tickets`, `service-ticket-detail`
  `/service/tickets/:ticketId`
- `service-inspections`, `service-knowledge`, `service-manuals`
- `service-assistant`, `service-messages`, `service-operations`

`tests/logic/client-routes.test.ts` pins every signed-in page's authorization
id. A new page is a new grant somebody has to be given, so add its entry there
deliberately.

## Data access

Pages read through `client/pages/service/service-api.ts` (`useApiClient`
wrappers). Server routes scope records by the signed-in user's own permission
sets — the client never filters for security.

## Copy

Every user-visible string goes through `client/locales/{en-US,zh-CN}.ts` under
the `service.*`, `navigation.*` and `auth.*` namespaces. `en-US.ts` defines the
shape that `zh-CN.ts` is checked against.
