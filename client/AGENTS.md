# Client notes: reimbursement pages

Feature-specific guidance for `client/pages/expenses/` and its route declaration. The root `AGENTS.md` still governs
everything else; this file records the decisions a future change would have to know.

## Routes

The feature is one route with three flat covering children, declared in `client/routes.ts`:

```
/expenses            client/pages/expenses/index.tsx   list + dashboard filters + export panel
  new                .../new.tsx                       thin wrapper over claim-editor
  :claimId           .../detail.tsx                    read + approve/reject/pay
  edit/:claimId      .../edit.tsx                      thin wrapper over claim-editor
```

Children are relative and render as `RouteChildPage`; `index.tsx` places its own `<Outlet />` at the end of its
`PageContainer`. A dynamic child (`:claimId`) must not declare `navigation` — the router throws. `edit/:claimId` is
declared after `:claimId`; React Router ranks the static `edit` segment above the parameter, so both resolve.

One `claim-editor.tsx` serves create and edit because the fields, validation and item table are identical; the wrappers
only choose the mode and the redirect target.

## Page authorization

Every expense route is checked against the same page grant, `{ resource: { type: 'page', id: 'expenses.claims' },
action: 'access' }`. The parent declares it; the children inherit it, which is why they omit `authz`. **The id
literal is duplicated on purpose** — the client never runs server code, so it is repeated from the seed
`database/main/seeds/202610010011_expense_departments.ts` (which exports `EXPENSE_CLAIMS_PAGE_ID`). Changing one without
the other locks every non-root user out of the feature while leaving the page registered.

Record-level visibility and action eligibility are **not** client authorization. The server decides both and returns
`capabilities` with each claim; the page only renders buttons the flags allow. Do not add a second permission system in
the browser.

## Module boundaries

`types.ts` holds wire types and the status/category value sets; `claim-format.ts` holds pure formatters (amounts,
dates, byte sizes). Components live in `.tsx` files and export no non-component constants, and constant maps that must
stay beside a component (the status → badge-variant map) are unexported — a file exporting both a component and an
object breaks Fast Refresh.

All server access goes through `claim-api.ts`, which takes the `ApiClient` from `useApiClient()`. Never call `fetch`,
never hard-code `/api`, and never derive a URL from `location`; the runtime restores the deployment base path.

## Invoice uploads

Items attach one invoice through the file plugin's client repository (`useApiClient()` plus the file component
extensions). The upload response's `contentUrl` is ephemeral: rebuild a display URL with `resolveAppUrl`, and store the
file id so a later read can rebuild it again. Image previews require a `mimeType` beginning `image/`.

## Export panel

The export runs server-side in the background and the panel polls the job every 1200 ms while it sits on the list page.
The progress bar is the job's `progress`; the download is a plain anchor styled with `buttonVariants`, so a large file
does not block the tab. Starting a second export while one runs is allowed — the panel lists the caller's recent jobs.

## Deliberate deviation: no browser verification

The frontend workflow's design-file and browser-screenshot steps were not run: this environment has no display. Layout,
interaction and both languages were implemented from the frontend references and verified by type checking, the route
test in `tests/logic/client-routes.test.ts`, and the API test, not by a rendered browser. Treat visual details as
unverified until someone opens the pages.
