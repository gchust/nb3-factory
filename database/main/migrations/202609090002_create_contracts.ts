import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The contract archive entry. `bodyFileId` links the single PDF body to a
 * row in `contract_files`; its unique constraint enforces the strictly
 * one-to-one relation (SQLite permits many NULLs, so contracts without a
 * body do not collide).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609090002_create_contracts',

  async up({ builder }) {
    await builder.createCollection('contracts', (collection) => {
      collection.increments('id');
      collection.string('contractNo', { length: 64, nullable: false });
      collection.string('name', { length: 255, nullable: false });
      collection.string('party', { length: 255, nullable: false });
      collection.date('signedAt', { nullable: true });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: true,
      });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'draft',
      });
      collection.text('remark', { nullable: true });
      collection.string('bodyFileId', { length: 36, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('contractNo');
      collection.unique('bodyFileId');
      collection.index('status');
      collection.index('party');
      collection.index('signedAt');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('contracts');
  },
});

export default migration;
