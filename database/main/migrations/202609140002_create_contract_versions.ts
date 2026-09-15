import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Version history of a contract. Each version groups the scans uploaded for it; attachments reference their version
 * through `contractAttachments.versionId`.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609140002_create_contract_versions',

  async up({ builder }) {
    await builder.createCollection('contractVersions', (collection) => {
      collection.uuid('id').notNull();
      collection.string('contractId', { length: 64, nullable: false });
      collection.string('versionNo', { length: 64, nullable: false });
      collection.text('description', { nullable: true });
      collection.datetime('uploadedAt', { nullable: false });
      collection.string('uploadedById', { length: 64, nullable: false });
      collection.string('uploadedByName', { length: 255, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.primary('id', { name: 'pk_contract_versions' });
      collection.index('contractId', {
        name: 'idx_contract_versions_contract',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('contractVersions');
  },
});

export default migration;
