# Server

Application-owned server code lives in `providers/` (services and lifecycle) and `routes/` (HTTP endpoints). The
template's `runtime.ts`, `app.ts`, `standalone.ts`, `embedded.ts` and `config/` compose it.

## The document library (资料库)

- `providers/library.ts` — `libraryServiceToken` and `DefaultLibraryService`. It owns the visibility rules and all
  reads/writes; it does not know about HTTP.
- `routes/library.ts` — the `/api/library/...` endpoints. `routes/schemas.ts` holds their zod input and response
  schemas.
- Both are registered in `providers/index.ts` and `routes/index.ts`.

`LibraryProvider` binds the service to its token in `register()`. Calling `createServiceToken('library')` anywhere
else would create a different key; always import `libraryServiceToken`.

### Visibility rules (server-enforced)

A material is readable when **any** of these holds, checked in the service, never in the browser:

- the actor is an administrator (`actor.isAdmin`);
- the actor owns it;
- it is published, not confidential, and the actor is a library member (has any role);
- it is temporarily shared with the actor — unless it is confidential.

Confidential outranks a share: an administrator can share 机密资料 C with 阅读者乙, and 乙 still cannot read it. A
material the actor may not read is reported as `404`, not `403`, so its existence does not leak.

Writable means administrator or owner — read permission is not edit permission. Creating and deleting require
`editor` (or administrator). Sharing and personnel management require `isAdmin`.

### Administrators

`actor.isAdmin` is `authz.snapshot().unrestricted` (the root permission set) or a row in
`authorizationPermissionSetAssignments` with `permissionSetKey = 'root'`. The `/library/users` and share endpoints use
this same signal, so the API and the Client agree on who is an administrator. Do not use `authz.require()` with a page
resource here: the page grant is a UI concern and does not recognize the root session.

### Conventions

- Every route declares itself with `describeRoute()` (tags `Library`, an English summary, a unique camelCase
  `operationId`) and validates input with `apiValidator()`. A route without a declaration is a defect.
- The `/library` sub-router installs `authentication.required()` and `authorization.middleware()` on itself only.
  A `router.use('*', ...)` on the outer router would leak into contributions mounted later.
- Domain errors (`LibraryNotFoundError`, `LibraryForbiddenError`, `LibraryInvalidInputError`) are mapped to the
  standard `/api` error body by `toLibraryApiError`; routes never build an error body by hand.
- Account lifecycle (disable/enable, sessions) belongs to the users plugin. The library adds only the role endpoints
  and calls the plugin's HTTP endpoints from the Client; it never reimplements account state.
