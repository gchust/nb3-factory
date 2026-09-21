import { defineMigration } from '@nocobase/db';

/**
 * Business attachments for suppliers and contracts.
 *
 * Bytes live in the `data` column so a seed can provide deterministic sample content in any deployment without
 * depending on a filesystem layout, and so a delete removes the content and its metadata atomically. Every list
 * query selects metadata columns explicitly and never loads `data`.
 */
export default defineMigration({
  name: '202609210002_create_compliance_files',
  async up({ builder }) {
    await builder.createCollection('complianceFiles', (collection) => {
      collection.uuid('id').notNull();
      collection.string('filename', { length: 512, nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.integer('size', { nullable: false });
      collection.blob('data').notNull();
      // Every file belongs to exactly one procurement organization.
      collection.integer('organizationId', { nullable: false });
      collection.integer('supplierId').nullable();
      collection.integer('contractId').nullable();
      // business_license | quality_cert | audit_photo | contract_file | bank_info | rectification | other
      collection
        .string('category', { length: 64, nullable: false })
        .defaultTo('other');
      collection.text('note').nullable();
      collection.string('uploadedById', { length: 64, nullable: false });
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_compliance_file' });
      collection.index('organizationId', { name: 'idx_compliance_file_org' });
      collection.index('supplierId', { name: 'idx_compliance_file_supplier' });
      collection.index('contractId', { name: 'idx_compliance_file_contract' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('complianceFiles');
  },
});
