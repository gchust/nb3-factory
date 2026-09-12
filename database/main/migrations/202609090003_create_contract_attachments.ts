import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Links a contract (one) to its attachment rows in `contract_files` (many).
 * `fileId` is unique so the same uploaded file can never belong to two
 * contracts; deleting one link leaves every other link and contract intact.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609090003_create_contract_attachments',

  async up({ builder }) {
    await builder.createCollection('contract_attachments', (collection) => {
      collection.increments('id');
      collection.integer('contractId', { nullable: false });
      collection.string('fileId', { length: 36, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.index('contractId');
      collection.unique('fileId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('contract_attachments');
  },
});

export default migration;
