import { defineMigration } from '@nocobase/db';

/**
 * Equipment ledger. Whether a device is currently on loan is derived from the
 * active row in `equipmentLoans`, never stored here, so the two cannot drift.
 */
const migration = defineMigration({
  name: '202609020001_create_equipment',
  async up({ builder }) {
    await builder.createCollection('equipment', (collection) => {
      collection.increments('id');
      collection.string('assetCode', { length: 64, nullable: false });
      collection.string('name', { length: 255, nullable: false });
      collection.string('category', { length: 128, nullable: true });
      collection.text('notes', { nullable: true });
      collection.datetimeTz('createdAt', { nullable: false });
      collection.unique('assetCode', { name: 'uq_equipment_asset_code' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('equipment');
  },
});

export default migration;
