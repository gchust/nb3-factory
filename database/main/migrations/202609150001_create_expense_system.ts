import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Expense reimbursement and finance review system.
 *
 * Every field, index and constraint is spelled out here: a migration is immutable history and must stay
 * self-contained, so nothing is imported from runtime code. Monetary values are stored as integer cents to avoid
 * floating point drift; calendar dates are stored as `YYYY-MM-DD` strings so a date never shifts across time zones.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609150001_create_expense_system',

  async up({ builder }) {
    await builder.createCollection('departments', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 120, nullable: false });
      collection.string('code', { length: 32, nullable: true });
      collection.string('managerId', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('name');
      collection.unique('code');
      collection.index('managerId');
    });

    await builder.createCollection('departmentMembers', (collection) => {
      collection.increments('id');
      collection.integer('departmentId', { nullable: false });
      collection.string('userId', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('departmentId');
      collection.unique('userId');
    });

    await builder.createCollection('expenseClaims', (collection) => {
      collection.increments('id');
      collection.string('number', { length: 64, nullable: false });
      collection.string('applicantId', { length: 64, nullable: false });
      collection.integer('departmentId', { nullable: true });
      collection.text('reason', { nullable: false });
      collection.string('expenseDate', { length: 10, nullable: false });
      collection.integer('totalCents', { nullable: false, defaultValue: 0 });
      collection.string('status', { length: 32, nullable: false });
      collection.text('rejectReason', { nullable: true });
      collection.string('paymentDate', { length: 10, nullable: true });
      collection.integer('loanId', { nullable: true });
      collection.string('createdById', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('number');
      collection.index('applicantId');
      collection.index('departmentId');
      collection.index('status');
      collection.index('loanId');
    });

    await builder.createCollection('expenseItems', (collection) => {
      collection.increments('id');
      collection.integer('claimId', { nullable: false });
      collection.string('category', { length: 32, nullable: false });
      collection.integer('amountCents', { nullable: false });
      collection.text('remark', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('claimId');
      collection.index('category');
    });

    await builder.createCollection('loans', (collection) => {
      collection.increments('id');
      collection.string('borrowerId', { length: 64, nullable: false });
      collection.integer('amountCents', { nullable: false });
      collection.string('loanDate', { length: 10, nullable: false });
      collection.text('purpose', { nullable: true });
      collection.boolean('settled', { nullable: false, defaultValue: false });
      collection.integer('settledByClaimId', { nullable: true });
      collection.datetime('settledAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('borrowerId');
      collection.index('settled');
      collection.index('settledByClaimId');
    });

    await builder.createCollection('expenseClaimAttachments', (collection) => {
      collection.increments('id');
      collection.integer('claimId', { nullable: false });
      collection.string('fileId', { length: 36, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.index('claimId');
      collection.index('fileId');
    });

    // Owned by the application but shaped exactly as @nocobase/app-plugin-file requires: the collection name and
    // fields are a contract, and extra required columns would break uploads because upload supplies no business
    // values. See the file plugin's Skill.
    await builder.createCollection('invoice_files', (collection) => {
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
  },

  async down({ builder }) {
    await builder.dropCollection('invoice_files');
    await builder.dropCollection('expenseClaimAttachments');
    await builder.dropCollection('loans');
    await builder.dropCollection('expenseItems');
    await builder.dropCollection('expenseClaims');
    await builder.dropCollection('departmentMembers');
    await builder.dropCollection('departments');
  },
});

export default migration;
