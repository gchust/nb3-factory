import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * One row per lending of one piece of equipment.
 *
 * A loan with `returnedAt` null is the active loan of its equipment; returning
 * sets `returnedAt` and keeps the row, so the historical record survives. The
 * unique "one active loan per equipment" rule is enforced by the application
 * service inside a transaction, because a portable partial unique index is not
 * available across all supported dialects.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609260002_create_equipment_loans',
  async up({ builder }) {
    await builder.createCollection('equipmentLoans', (collection) => {
      collection.increments('id');
      collection.integer('equipmentId', { nullable: false });
      collection.string('borrower', { length: 128, nullable: false });
      collection.text('purpose', { nullable: true });
      collection.datetime('borrowedAt', { nullable: false });
      collection.datetime('dueAt', { nullable: false });
      collection.datetime('returnedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('equipmentId', {
        name: 'fk_equipment_loans_equipment',
        references: { collection: 'equipment', fields: ['id'] },
        onDelete: 'restrict',
        onUpdate: 'cascade',
      });
      collection.index('equipmentId');
      collection.index('borrower');
      collection.index('returnedAt');
      collection.index('dueAt');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('equipmentLoans');
  },
});

export default migration;
