import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Immutable submission history for a reimbursement.
 *
 * A return-and-resubmit cycle replaces the *working* receipts with new ones. Without a snapshot the earlier
 * approval would point at whatever receipts the report currently holds, so the receipts a manager actually saw
 * would be lost. Each `submit` therefore writes one `expenseReportRevisions` row plus a frozen copy of the items
 * (`expenseRevisionItems`) and of the linked files (`expenseRevisionFiles`); the decision later lands on that same
 * revision row. Nothing here is ever updated or deleted, and the receipt bytes stay addressable because runtime
 * code refuses to delete a file referenced by a revision.
 *
 * A receipt can appear in more than one revision, so `fileId` is indexed but not unique. The revision number is
 * unique per report.
 *
 * Self-contained by design: every table, column, index and constraint is spelled out here so the meaning of this
 * already-applied migration cannot change when runtime code evolves.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190003_create_expense_revisions',

  async up({ builder }) {
    await builder.createCollection('expenseReportRevisions', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('reportId', { length: 64 }).notNull();
      collection.integer('revision').notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.string('decision', { length: 32 }).nullable();
      collection.text('comment').nullable();
      collection.string('decidedBy', { length: 64 }).nullable();
      collection.string('decidedByName', { length: 255 }).nullable();
      collection.datetime('submittedAt').notNull();
      collection.datetime('decidedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_expense_revisions' });
      collection.unique(['reportId', 'revision'], {
        name: 'uq_expense_revisions_report_revision',
      });
      collection.index('reportId', { name: 'idx_expense_revisions_report' });
    });

    await builder.createCollection('expenseRevisionItems', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('revisionId', { length: 64 }).notNull();
      collection.string('reportId', { length: 64 }).notNull();
      collection.string('itemId', { length: 64 }).notNull();
      collection.string('categoryId', { length: 64 }).notNull();
      collection.string('categoryName', { length: 128 }).notNull();
      collection.datetime('expenseDate').notNull();
      collection.decimal('amount', { precision: 14, scale: 2 }).notNull();
      collection.text('description').nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_expense_revision_items' });
      collection.index('revisionId', {
        name: 'idx_expense_revision_items_revision',
      });
      collection.index('reportId', {
        name: 'idx_expense_revision_items_report',
      });
    });

    await builder.createCollection('expenseRevisionFiles', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('revisionId', { length: 64 }).notNull();
      collection.string('reportId', { length: 64 }).notNull();
      collection.string('itemId', { length: 64 }).nullable();
      collection.string('fileId', { length: 36 }).notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.string('kind', { length: 32 }).notNull().defaultTo('receipt');
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_expense_revision_files' });
      collection.index('revisionId', {
        name: 'idx_expense_revision_files_revision',
      });
      collection.index('reportId', {
        name: 'idx_expense_revision_files_report',
      });
      collection.index('fileId', { name: 'idx_expense_revision_files_file' });
    });

    // The action that opened or decided a revision records it explicitly, so an
    // old approval can be tied to the exact receipt set it reviewed.
    await builder.addField('expenseActions', {
      name: 'revision',
      type: 'integer',
      nullable: true,
    });
  },

  async down({ builder }) {
    await builder.dropField('expenseActions', 'revision');
    await builder.dropCollection('expenseRevisionFiles');
    await builder.dropCollection('expenseRevisionItems');
    await builder.dropCollection('expenseReportRevisions');
  },
});

export default migration;
