import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Expense reimbursement (报销) module.
 *
 * Tables:
 * - expense_claims: the claim itself (报销单)
 * - expense_claim_items: 1..N 明细 lines per claim
 * - expense_claim_attachments: 明细 attachment links (join rows that
 *   denormalize the file metadata for display)
 * - expense_claim_files: the file-managed collection the `file` plugin's
 *   ServerFileRepositoryManager writes into on upload. It must keep exactly
 *   the fields the file repository validates (id/disk/key/filename/ext/
 *   mimeType/size/createdAt/updatedAt) and nothing else, so the join table is
 *   the place that stores the business relation.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609120001_create_expense_claims',

  async up({ builder }) {
    await builder.createCollection('expense_claims', (collection) => {
      collection.uuid('id').notNull();
      collection.primary('id', { name: 'pk_expense_claims' });
      collection.string('claimNumber', { length: 64 }).notNull();
      collection.string('applicantId', { length: 64 }).notNull();
      collection.string('applicantName', { length: 255 }).notNull();
      collection.string('expenseType', { length: 64 }).notNull();
      collection.date('expenseDate').notNull();
      collection.decimal('totalAmount', { precision: 12, scale: 2 }).notNull();
      collection.text('description').nullable();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.string('reviewerId', { length: 64 }).nullable();
      collection.datetime('reviewedAt').nullable();
      collection.text('rejectReason').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('claimNumber', {
        name: 'uq_expense_claims_claimNumber',
      });
      collection.index('applicantId', {
        name: 'idx_expense_claims_applicant',
      });
      collection.index('status', { name: 'idx_expense_claims_status' });
    });

    await builder.createCollection('expense_claim_items', (collection) => {
      collection.uuid('id').notNull();
      collection.primary('id', { name: 'pk_expense_claim_items' });
      collection.string('claimId', { length: 64 }).notNull();
      collection.string('itemName', { length: 255 }).notNull();
      collection.decimal('amount', { precision: 12, scale: 2 }).notNull();
      collection.string('note', { length: 500 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('claimId', {
        name: 'idx_expense_claim_items_claim',
      });
      collection.foreignKey('claimId', {
        name: 'fk_expense_claim_items_claim',
        references: { collection: 'expense_claims', fields: ['id'] },
        onDelete: 'cascade',
      });
    });

    await builder.createCollection(
      'expense_claim_attachments',
      (collection) => {
        collection.uuid('id').notNull();
        collection.primary('id', { name: 'pk_expense_claim_attachments' });
        collection.string('claimId', { length: 64 }).notNull();
        collection.string('fileId', { length: 64 }).notNull();
        collection.string('filename', { length: 255 }).notNull();
        collection.string('ext', { length: 32 }).notNull();
        collection.string('mimeType', { length: 255 }).notNull();
        collection.bigInt('size').notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.index('claimId', {
          name: 'idx_expense_claim_attachments_claim',
        });
        collection.index('fileId', {
          name: 'idx_expense_claim_attachments_file',
        });
        collection.foreignKey('claimId', {
          name: 'fk_expense_claim_attachments_claim',
          references: { collection: 'expense_claims', fields: ['id'] },
          onDelete: 'cascade',
        });
      },
    );

    await builder.createCollection('expense_claim_files', (collection) => {
      collection.uuid('id').notNull();
      collection.primary('id', { name: 'pk_expense_claim_files' });
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
    await builder.dropCollection('expense_claim_files');
    await builder.dropCollection('expense_claim_attachments');
    await builder.dropCollection('expense_claim_items');
    await builder.dropCollection('expense_claims');
  },
});

export default migration;
