import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The contract archive entry. `attachmentId` links the contract to at most one
 * row in `contract_files`; the unique constraint enforces the one-to-one
 * relation (SQLite and the other dialects allow many NULLs, so contracts
 * without an attachment do not collide). `category` is indexed because the
 * list filters on it.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130002_create_contracts',

  async up({ builder }) {
    await builder.createCollection('contracts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('counterparty', { length: 255, nullable: false });
      collection.string('category', { length: 32, nullable: false });
      collection.string('attachmentId', { length: 36, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('category');
      collection.unique('attachmentId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('contracts');
  },
});

export default migration;
