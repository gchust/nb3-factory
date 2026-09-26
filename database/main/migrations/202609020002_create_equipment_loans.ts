import { defineMigration } from '@nocobase/db';

/**
 * One row per borrow of one device. A return is recorded by filling
 * `returnedAt` on the existing row, so the original borrow is never lost and a
 * repeated return call cannot create a second record.
 *
 * A device is unavailable while it has at least one row with `returnedAt` null.
 * The partial uniqueness that would enforce this at the database level is not
 * portable across SQLite and PostgreSQL, so the borrowing transaction checks it
 * instead; the indexes below keep those checks and the list reads cheap.
 */
const migration = defineMigration({
  name: '202609020002_create_equipment_loans',
  async up({ builder }) {
    await builder.createCollection('equipmentLoans', (collection) => {
      collection.increments('id');
      collection.integer('equipmentId', { nullable: false });
      collection.string('borrower', { length: 255, nullable: false });
      collection.text('purpose', { nullable: true });
      collection.datetimeTz('borrowedAt', { nullable: false });
      collection.datetimeTz('expectedReturnAt', { nullable: false });
      collection.datetimeTz('returnedAt', { nullable: true });
      collection.datetimeTz('createdAt', { nullable: false });
      collection.foreignKey('equipmentId', {
        name: 'fk_equipment_loans_equipment_id',
        references: { collection: 'equipment', fields: ['id'] },
        onDelete: 'restrict',
        onUpdate: 'cascade',
      });
      collection.index('equipmentId', {
        name: 'idx_equipment_loans_equipment_id',
      });
      collection.index('returnedAt', {
        name: 'idx_equipment_loans_returned_at',
      });
      collection.index('expectedReturnAt', {
        name: 'idx_equipment_loans_expected_return_at',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('equipmentLoans');
  },
});

export default migration;
