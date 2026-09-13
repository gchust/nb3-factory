import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Expense claims, their invoice attachments, and the link between them.
//
// The attachment metadata table uses the fixed column set required by
// `@nocobase/app-plugin-file`: uploads generate every value, so the columns and
// their types are spelled out here rather than derived from an evolving schema.
const migration: MigrationDefinition = defineMigration({
  name: '202609130001_create_expense_claims',

  async up({ builder }) {
    await builder.createCollection('expenseClaims', (collection) => {
      collection.increments('id');
      collection.string('reason', { length: 255, nullable: false });
      collection.decimal('amount', {
        precision: 12,
        scale: 2,
        nullable: false,
      });
      collection.date('expenseDate', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('expenseDate');
    });

    await builder.createCollection('expenseClaimFiles', (collection) => {
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

    await builder.createCollection('expenseClaimAttachments', (collection) => {
      collection.increments('id');
      collection.integer('expenseClaimId', { nullable: false });
      collection.string('fileId', { length: 36, nullable: false });
      collection.integer('sort', { nullable: false, defaultValue: 0 });
      collection.datetime('createdAt', { nullable: false });
      collection.index('expenseClaimId');
      collection.unique('fileId');
    });
  },

  async down({ builder }) {
    // Links first, then the files they point at, then the claims.
    await builder.dropCollection('expenseClaimAttachments');
    await builder.dropCollection('expenseClaimFiles');
    await builder.dropCollection('expenseClaims');
  },
});

export default migration;
