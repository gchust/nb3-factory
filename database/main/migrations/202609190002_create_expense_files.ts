import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Receipts and supporting documents for expense reimbursements.
 *
 * `expenseFiles` holds the File Repository metadata columns the file plugin
 * requires; `ownerId` is stamped from the caller's principal on upload so an
 * unlinked upload can still be traced to the employee who made it.
 *
 * Receipts belong to a single expense item (`expenseItemFiles`) and report-level
 * supporting documents belong to the report itself (`expenseReportFiles`), so the
 * two kinds of material never mix. Each file can be linked at most once.
 *
 * Self-contained by design: every table, column, index and constraint is spelled
 * out here so the meaning of this already-applied migration cannot change when
 * runtime code evolves.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190002_create_expense_files',

  async up({ builder }) {
    await builder.createCollection('expenseFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.string('ownerId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('ownerId', { name: 'idx_expense_files_owner' });
    });

    await builder.createCollection('expenseItemFiles', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('reportId', { length: 64 }).notNull();
      collection.string('itemId', { length: 64 }).notNull();
      collection.string('fileId', { length: 36 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_expense_item_files' });
      collection.unique('fileId', { name: 'uq_expense_item_files_file' });
      collection.index('itemId', { name: 'idx_expense_item_files_item' });
      collection.index('reportId', { name: 'idx_expense_item_files_report' });
    });

    await builder.createCollection('expenseReportFiles', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('reportId', { length: 64 }).notNull();
      collection.string('fileId', { length: 36 }).notNull();
      collection
        .string('kind', { length: 32 })
        .notNull()
        .defaultTo('supplement');
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_expense_report_files' });
      collection.unique('fileId', { name: 'uq_expense_report_files_file' });
      collection.index('reportId', { name: 'idx_expense_report_files_report' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('expenseReportFiles');
    await builder.dropCollection('expenseItemFiles');
    await builder.dropCollection('expenseFiles');
  },
});

export default migration;
