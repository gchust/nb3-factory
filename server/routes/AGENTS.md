# Application routes

These are the application's own `/api` routes, added with `defineApiRoutes()`. Each route factory creates and returns
its own Hono router; the path never repeats `/api` and never includes the deployment base path, which the runtime adds.

## Every route

- Authenticates itself. Mounting under `/api` does not authenticate anything, so a path this directory owns installs
  its own middleware — `router.use('/devices', auth.required())` for the ledger. Scope middleware to the exact paths
  owned or to an isolated sub-router; a `router.use('*', ...)` leaks into contributions mounted later.
- Declares itself for the API document: `describeRoute({ tags, summary, operationId, responses })` with a unique
  camelCase `operationId`, and validates every input with `apiValidator()`. `pnpm exec vitest` asserts
  `findUndeclaredApiRoutes()` and `findApiDocumentSchemaProblems()` are empty.
- Lists exactly the statuses it can produce. Input validation adds `400` through `apiValidator`; list it yourself only
  for another reason. An authenticated route adds `401`; add `403` only when it checks a permission set rather than
  just identity.

## Errors

- Build an `ApiError` from `@nocobase/app-server/router` and throw it. Never write an error body by hand.
- An application error uses the **feature's** domain, not the framework's `'app'`: the ledger reports
  `domain: 'devices'` with reasons `DEVICE_CODE_TAKEN` and `DEVICE_NOT_FOUND`. An error that comes out of a Repository
  is left to propagate as `'app'`; do not restate it.
- Translate the user-facing text at the request. `getRequestTranslator(context)` and `getRequestLocale(context)` from
  `@nocobase/i18n/server` read the language the caller asked for; pass the result as `localizedMessage` so the client
  receives a sentence and branches on `reason`, while `message` stays developer-facing English.
- Keep HTTP concerns here and domain logic in the service under `server/providers/`. A service does not read a Hono
  context, return a status code, or decide retry behavior.
