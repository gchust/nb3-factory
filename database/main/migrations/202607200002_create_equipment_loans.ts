import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Loan records: one row per borrow event.
 *
 * A return never deletes or replaces a row — it stamps `returnedAt` once and
 * leaves the original borrow facts in place. A row with `returnedAt` null is
 * the equipment's active loan; `expectedReturnAt` in the past marks it overdue
 * once the current time is applied.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202607200002_create_equipment_loans',

  async up({ builder }) {
    await builder.createCollection('equipmentLoans', (collection) => {
      collection.increments('id');
      collection.integer('equipmentId', { nullable: false });
      collection.string('borrower', { length: 128, nullable: false });
      collection.text('purpose', { nullable: false, defaultValue: '' });
      collection.datetime('borrowedAt', { nullable: false });
      collection.datetime('expectedReturnAt', { nullable: false });
      collection.datetime('returnedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('equipmentId', {
        references: { collection: 'officeEquipment', fields: ['id'] },
        name: 'fk_equipment_loans_equipment',
        onDelete: 'restrict',
      });
      collection.index(['equipmentId', 'returnedAt']);
      collection.index('returnedAt');
      collection.index('borrower');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('equipmentLoans');
  },
});

export default migration;
