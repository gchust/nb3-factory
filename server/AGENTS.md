# Server notes: reimbursement workflow

Feature-specific guidance for `server/expense/` and the routes that expose it. The root `AGENTS.md` still governs
everything else; this file records the decisions a future change would have to know.

## Layout

```
server/expense/model.ts      record types, statuses, categories, amount + size limits, no framework imports
server/expense/logic.ts      pure rules: status machine, totals, CSV rows, formatters
server/expense/store.ts      ExpenseStore port over DatabaseManager
server/expense/service.ts    ExpenseService: visibility, eligibility, actions, stats, exports
server/expense/errors.ts     ExpenseError with a stable `reason`
server/expense/provider.ts   ExpenseProvider -> expenseServiceToken
server/routes/expense.ts     the /api/expense* endpoints
server/routes/expense-files.ts  the invoice file exposure, wrapped in a session guard
server/routes/schemas.ts     zod input schemas + documented response schemas
```

`ExpenseProvider` is registered in `server/providers/index.ts`; the routes are exported from `server/routes/index.ts`.
The service does not read Hono contexts: routes resolve the actor from the session and hand the service a plain
`Actor`, so the same service backs a route, a job or a test.

## HTTP rules this feature follows

- Every route declares `describeRoute()` and validates input with `apiValidator()`. `sessionOnlyResponses` (401/500)
  is used for query-scoped reads that cannot answer 403; routes that decide per record spread `apiErrorResponses`.
- Middleware is installed per owned prefix (`/expenseClaims/*`, `/expenseDepartments/*`, …), never as a bare
  `router.use('*')` — a contribution shares the mounted `/api` router with every other contribution.
- Errors are `ExpenseError` in the service and mapped to the `/api` body in one place (`toExpenseApiError`). The
  `reason` codes the client branches on live there; do not rename one without updating `client/pages/expenses`.

## Authorization split

`@nocobase/app-plugin-authorization` governs **page access only** (the `expenses.claims` page grant, created by the
seed). Record-level visibility and action eligibility are decided in `ExpenseService`:

- `isFinance` = an active member of the department with `code === 'finance'`.
- `manages` = the actor is the manager of the claim's department or of an ancestor.
- `canView` = applicant, finance, or a manager of the department.
- `capabilities` returned with every claim are what the browser renders from.

Do not move these rules into the permission plugin: they depend on relations the plugin cannot express, and the
existing checks in `tests/logic/expense-logic.test.ts` are the contract.

## Invoice storage

Invoices are file-plugin records in `expenseInvoiceFiles` (disk `local`, `accessPath /uploads/expenseInvoices`,
`accessMode stream`). The exposure is upload-only; the plugin cannot express "the applicant, their manager and finance"
as a policy, so `read`/`update`/`delete` are closed and the detail page builds content URLs from the stored
`invoiceId`/`invoiceExt`.

**Documented limitation:** the content route (`/uploads/expenseInvoices/:id.:ext`) is keyed by an unguessable UUID and
gated only by a session — it does not re-check that the signed-in user may see the claim that references the invoice.
Closing `read` removes the listing leak; byte-level per-claim authorization is deliberately out of scope here. The app
wraps every generated path in `auth.required()` because the plugin's routes are public by default.

## Export jobs

`POST /expenseExports` answers immediately and a runner finishes the job in-process, deduplicating by job id. Unfinished
jobs are resumed in `ExpenseProvider.start()`; a host that mounts the runtime without this application's migrations
resolves no `expenseExportJobs` collection and resume is a no-op (`DatabaseExpenseStore.listUnfinishedExportJobs`
guards on the collection's existence) — do not turn that into a startup failure. The CSV uses a UTF-8 BOM and
bilingual column headers on purpose.

## A seeded sample value must be editable through the form

Sample claims use only categories from `EXPENSE_CATEGORIES`, otherwise the demo data cannot be re-saved in the page
that is meant to demonstrate the feature. Keep the seed's category set inside `server/expense/model.ts`'s list.

## Server locales

`server/locales/` is intentionally empty. The `/api` contract states `message` is developer-facing English and is never
shown to a user; the browser translates the stable `reason` code itself. Add keys there only if the server starts
producing text a user reads and that must change with their language.
