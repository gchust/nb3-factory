import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Equipment ledger: the asset itself, plus the availability flag the borrow and
 * return operations flip inside one transaction.
 *
 * `status` is stored rather than derived so "cannot borrow equipment that is
 * not returned yet" can be enforced with a conditional update that only one
 * concurrent borrow can win.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202607200001_create_office_equipment',

  async up({ builder }) {
    await builder.createCollection('officeEquipment', (collection) => {
      collection.increments('id');
      collection.string('assetNo', { length: 64, nullable: false });
      collection.string('name', { length: 128, nullable: false });
      collection.string('category', {
        length: 64,
        nullable: false,
        defaultValue: '',
      });
      collection.text('notes', { nullable: false, defaultValue: '' });
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'available',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('assetNo');
      collection.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('officeEquipment');
  },
});

export default migration;
