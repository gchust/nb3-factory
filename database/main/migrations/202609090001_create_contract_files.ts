import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Table backing the File plugin repositories used by the contract archive:
 * `contractBodyFiles` and `contractAttachments`. Both store into the same
 * collection (the plugin validates this exact shape before serving them).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609090001_create_contract_files',

  async up({ builder }) {
    await builder.createCollection('contract_files', (collection) => {
      collection.uuid('id', { nullable: false }).primary();
      collection.string('disk', { length: 255, nullable: false });
      collection.text('key', { nullable: false });
      collection.text('filename', { nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.integer('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('contract_files');
  },
});

export default migration;
