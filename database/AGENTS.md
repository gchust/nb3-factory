# Database notes: reimbursement schema

Feature-specific guidance for the expense tables and their sample data. The root `AGENTS.md` still governs everything
else.

## Migration

`database/main/migrations/202610010001_create_expense_reimbursement.ts` creates seven collections in one migration:
`expenseDepartments`, `expenseDepartmentMembers`, `expenseClaims`, `expenseItems`, `expenseApprovals`,
`expenseInvoiceFiles` and `expenseExportJobs`. `down` drops them in reverse dependency order.

The migration is self-contained: it spells out every field, index and default rather than importing anything from
`server/expense/`, so an already-applied migration cannot silently change when the model does. `status` and `category`
are `string`, not an enum, because the status machine gains states over time and an enum would make that a migration.

Amounts are `decimal(14, 2)`; the service reads and writes them through `toAmount` in `server/expense/logic.ts`. The
claim row denormalizes `applicantName` and `departmentName` so a list and an export render without a join.

## Seeds

```
202610010010_expense_sample_users.ts      demo users (password `demo12345`)
202610010011_expense_departments.ts       department tree + the `expense-member` page grant
202610010012_expense_sample_claims.ts     seven demo claims across the workflow
```

These are example data, not required structure. The editor is idempotent: it looks up by a natural key and updates
rather than inserting twice.

**A source seed must not import another source module with a `.js` specifier.** The seed loader rewrites only the entry
file's own extension, while the in-process test path runs seeds through Node's native type stripping, which does not
map `./x.js` back to `./x.ts`. `202610010011_expense_departments.ts` therefore inlines the `expense-member`
permission-set declaration and exports `EXPENSE_CLAIMS_PAGE_ID` for anything that needs to name the same page. Keep a
seed self-contained.

`database/main/collections/` is generated output (`pnpm nocobase collections generate`), gitignored, and never read
back; regenerate it after a model change rather than editing it.
