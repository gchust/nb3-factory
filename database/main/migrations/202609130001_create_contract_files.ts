import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Storage metadata for contract attachments, in the exact shape the File
 * plugin requires before it will serve a collection (uuid primary key plus
 * disk/key/filename/ext/mimeType/size/timestamps). The plugin never creates
 * this table; the application owns it.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130001_create_contract_files',

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
