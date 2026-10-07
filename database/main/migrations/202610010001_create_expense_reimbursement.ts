import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The expense reimbursement schema.
 *
 * Everything the feature needs is here, spelled out rather than imported from a registry: a migration is immutable
 * history, and a definition that keeps evolving would silently change what an already-applied migration means.
 *
 * Amounts are `decimal(14, 2)` — thousands of yuan with cents, stored exactly. Names that a reviewer reads
 * (applicant, department) are denormalised onto the claim so a list renders without a join per row; the ids remain
 * authoritative and the name columns are refreshed whenever the claim is written.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_create_expense_reimbursement',
  async up({ builder }) {
    await builder.createCollection('expenseDepartments', (collection) => {
      collection
        .title('Expense departments')
        .description(
          'Departments, their supervising manager and their parent in the hierarchy.',
        );
      collection.uuid('id').primary().notNull();
      collection.string('code', { length: 64 }).notNull().title('Code');
      collection.string('name', { length: 128 }).notNull().title('Name');
      collection
        .string('managerId', { length: 255 })
        .nullable()
        .title('Manager user id');
      collection.uuid('parentId').nullable().title('Parent department id');
      collection
        .integer('sortOrder')
        .defaultTo(0)
        .notNull()
        .title('Sort order');
      collection.boolean('active').defaultTo(true).notNull().title('Active');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('code', { name: 'uq_expense_departments_code' });
      collection.index('managerId', {
        name: 'idx_expense_departments_manager',
      });
      collection.index('parentId', { name: 'idx_expense_departments_parent' });
    });

    await builder.createCollection('expenseDepartmentMembers', (collection) => {
      collection
        .title('Expense department members')
        .description(
          'Which user belongs to which department; membership decides who sees and approves a claim.',
        );
      collection.uuid('id').primary().notNull();
      collection.uuid('departmentId').notNull().title('Department id');
      collection.string('userId', { length: 255 }).notNull().title('User id');
      collection
        .boolean('isPrimary')
        .defaultTo(true)
        .notNull()
        .title('Primary membership');
      collection.boolean('active').defaultTo(true).notNull().title('Active');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.foreignKey('departmentId', {
        name: 'fk_expense_department_members_department',
        references: { collection: 'expenseDepartments', fields: ['id'] },
        onDelete: 'cascade',
      });
      // The departmentId column is not nullable, so the unique key is enforced as written.
      // One row per user per department.
      collection.unique(['departmentId', 'userId'], {
        name: 'uq_expense_department_members_department_user',
      });
      collection.index('userId', {
        name: 'idx_expense_department_members_user',
      });
    });

    await builder.createCollection('expenseClaims', (collection) => {
      collection
        .title('Expense claims')
        .description(
          'One reimbursement application, with its workflow state and the amount the server computed.',
        );
      collection.uuid('id').primary().notNull();
      collection
        .string('claimNo', { length: 32 })
        .notNull()
        .title('Claim number');
      collection.string('title', { length: 255 }).notNull().title('Purpose');
      collection
        .string('applicantId', { length: 255 })
        .notNull()
        .title('Applicant user id');
      collection
        .string('applicantName', { length: 255 })
        .notNull()
        .title('Applicant name');
      collection.uuid('departmentId').nullable().title('Department id');
      collection
        .string('departmentName', { length: 255 })
        .nullable()
        .title('Department name');
      collection
        .string('status', { length: 32 })
        .defaultTo('draft')
        .notNull()
        .title('Status');
      collection
        .decimal('totalAmount', { precision: 14, scale: 2 })
        .defaultTo(0)
        .notNull()
        .title('Total amount');
      collection.text('remark').nullable().title('Remark');
      collection.datetime('submittedAt').nullable().title('Submitted at');
      collection.datetime('decidedAt').nullable().title('Decided at');
      collection.datetime('paidAt').nullable().title('Paid at');
      collection
        .string('paymentMethod', { length: 64 })
        .nullable()
        .title('Payment method');
      collection
        .string('paymentRemark', { length: 255 })
        .nullable()
        .title('Payment remark');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('claimNo', { name: 'uq_expense_claims_claim_no' });

      collection.index('applicantId', { name: 'idx_expense_claims_applicant' });
      collection.index('departmentId', {
        name: 'idx_expense_claims_department',
      });
      collection.index('status', { name: 'idx_expense_claims_status' });
      collection.index('submittedAt', {
        name: 'idx_expense_claims_submitted_at',
      });
    });

    await builder.createCollection('expenseItems', (collection) => {
      collection
        .title('Expense claim items')
        .description(
          'A single expense line on a claim, optionally carrying one invoice attachment.',
        );
      collection.uuid('id').primary().notNull();
      collection.uuid('claimId').notNull().title('Claim id');
      collection.string('category', { length: 64 }).notNull().title('Category');
      collection
        .decimal('amount', { precision: 14, scale: 2 })
        .defaultTo(0)
        .notNull()
        .title('Amount');
      collection.date('expenseDate').nullable().title('Expense date');
      collection
        .string('description', { length: 500 })
        .nullable()
        .title('Description');
      collection.uuid('invoiceId').nullable().title('Invoice attachment id');
      collection
        .string('invoiceName', { length: 255 })
        .nullable()
        .title('Invoice file name');
      collection
        .string('invoiceExt', { length: 32 })
        .nullable()
        .title('Invoice file extension');
      collection
        .string('invoiceType', { length: 128 })
        .nullable()
        .title('Invoice MIME type');
      collection
        .integer('sortOrder')
        .defaultTo(0)
        .notNull()
        .title('Sort order');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.foreignKey('claimId', {
        name: 'fk_expense_items_claim',
        references: { collection: 'expenseClaims', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.index('claimId', { name: 'idx_expense_items_claim' });
    });

    // The file plugin's File Repository contract fixes this collection's columns: it writes every one of them and
    // reads them back, so the shape is not ours to change. The invoice is linked from the claim item that carries it.
    await builder.createCollection('expenseInvoiceFiles', (collection) => {
      collection
        .title('Expense invoice files')
        .description(
          'Invoice attachments stored by the File Repository; the columns are fixed by its contract.',
        );
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    await builder.createCollection('expenseApprovals', (collection) => {
      collection
        .title('Expense approval history')
        .description(
          'Every submit, approve, reject and pay action: who did it, when, and why.',
        );
      collection.uuid('id').primary().notNull();
      collection.uuid('claimId').notNull().title('Claim id');
      collection.string('action', { length: 32 }).notNull().title('Action');
      collection
        .string('operatorId', { length: 255 })
        .notNull()
        .title('Operator user id');
      collection
        .string('operatorName', { length: 255 })
        .notNull()
        .title('Operator name');
      collection
        .string('fromStatus', { length: 32 })
        .notNull()
        .title('From status');
      collection
        .string('toStatus', { length: 32 })
        .notNull()
        .title('To status');
      collection.text('comment').nullable().title('Comment');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.foreignKey('claimId', {
        name: 'fk_expense_approvals_claim',
        references: { collection: 'expenseClaims', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.index('claimId', { name: 'idx_expense_approvals_claim' });
    });

    await builder.createCollection('expenseExportJobs', (collection) => {
      collection
        .title('Expense export jobs')
        .description(
          'A batch export the user started and can keep working while it runs.',
        );
      collection.uuid('id').primary().notNull();
      collection
        .string('requesterId', { length: 255 })
        .notNull()
        .title('Requester user id');
      collection
        .string('status', { length: 32 })
        .defaultTo('pending')
        .notNull()
        .title('Status');
      collection.text('filter').nullable().title('Filter snapshot');
      collection.integer('total').defaultTo(0).notNull().title('Total rows');
      collection
        .integer('processed')
        .defaultTo(0)
        .notNull()
        .title('Processed rows');
      collection
        .string('resultFilename', { length: 255 })
        .nullable()
        .title('Result file name');
      collection.text('resultContent').nullable().title('Result content');
      collection
        .bigInt('resultSize')
        .defaultTo(0)
        .notNull()
        .title('Result size');
      collection.text('error').nullable().title('Error');
      collection.datetime('startedAt').nullable().title('Started at');
      collection.datetime('finishedAt').nullable().title('Finished at');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('requesterId', {
        name: 'idx_expense_export_jobs_requester',
      });
      collection.index('status', { name: 'idx_expense_export_jobs_status' });
    });
  },
  async down({ builder }) {
    // Reverse dependency order: children before their parents.
    await builder.dropCollection('expenseExportJobs');
    await builder.dropCollection('expenseApprovals');
    await builder.dropCollection('expenseItems');
    await builder.dropCollection('expenseClaims');
    await builder.dropCollection('expenseInvoiceFiles');
    await builder.dropCollection('expenseDepartmentMembers');
    await builder.dropCollection('expenseDepartments');
  },
});

export default migration;
