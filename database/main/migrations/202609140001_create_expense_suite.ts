import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Expense claim, receipt, department, and receipt-file storage.
 *
 * Static and self-contained: every column, index, and constraint is spelled out here so an already-applied
 * migration keeps meaning the same thing. Runtime code never imports this definition.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609140001_create_expense_suite',

  async up({ builder }) {
    await builder.createCollection('expenseDepartments', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.string('managerId', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('name', { name: 'uq_expense_departments_name' });
      collection.index('managerId', {
        name: 'idx_expense_departments_manager',
      });
    });

    await builder.createCollection('expenseClaims', (collection) => {
      collection.increments('id');
      collection.string('number', { length: 64, nullable: false });
      collection.string('applicantId', { length: 64, nullable: false });
      collection.string('applicantName', { length: 255, nullable: false });
      collection.integer('departmentId', { nullable: false });
      collection.string('departmentName', { length: 255, nullable: false });
      collection.string('type', { length: 32, nullable: false });
      collection.text('reason', { nullable: false });
      collection.datetime('appliedAt', { nullable: false });
      collection.string('status', { length: 32, nullable: false });
      // The total is always derived from the receipts; it is never accepted from a form.
      collection.decimal('totalAmount', {
        precision: 14,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.integer('receiptCount', { nullable: false, defaultValue: 0 });
      collection.text('rejectReason', { nullable: true });
      collection.datetime('submittedAt', { nullable: true });
      collection.datetime('decidedAt', { nullable: true });
      collection.string('decidedById', { length: 64, nullable: true });
      collection.datetime('paidAt', { nullable: true });
      collection.string('paidById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('number', { name: 'uq_expense_claims_number' });
      collection.index('applicantId', { name: 'idx_expense_claims_applicant' });
      collection.index('departmentId', {
        name: 'idx_expense_claims_department',
      });
      collection.index('status', { name: 'idx_expense_claims_status' });
    });

    await builder.createCollection('expenseReceipts', (collection) => {
      collection.increments('id');
      collection.integer('claimId', { nullable: false });
      // Denormalised so record-access policies can filter receipts without a join.
      collection.string('applicantId', { length: 64, nullable: false });
      collection.integer('departmentId', { nullable: false });
      collection.string('fileId', { length: 36, nullable: false });
      collection.string('filename', { length: 255, nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: false,
      });
      collection.datetime('invoiceDate', { nullable: false });
      collection.string('receiptType', { length: 32, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('claimId', { name: 'idx_expense_receipts_claim' });
      collection.unique('fileId', { name: 'uq_expense_receipts_file' });
      collection.index('applicantId', {
        name: 'idx_expense_receipts_applicant',
      });
      collection.index('departmentId', {
        name: 'idx_expense_receipts_department',
      });
    });

    // Storage table owned by the application but written through the File plugin's Repository.
    await builder.createCollection('expenseReceiptFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255, nullable: false });
      collection.text('key', { nullable: false });
      collection.text('filename', { nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('expenseReceiptFiles');
    await builder.dropCollection('expenseReceipts');
    await builder.dropCollection('expenseClaims');
    await builder.dropCollection('expenseDepartments');
  },
});

export default migration;
