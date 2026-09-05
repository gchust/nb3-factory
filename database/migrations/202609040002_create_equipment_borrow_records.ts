import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Borrow and return history. `borrowerId` mirrors the authentication plugin's
 * user id (kept as a plain string column rather than a hard foreign key so the
 * ledger does not depend on the authentication schema). `returnedAt` is null
 * while the equipment is out and set by the return flow.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609040002_create_equipment_borrow_records',
  async up({ builder }) {
    await builder.createCollection('equipmentBorrowRecord', (collection) => {
      collection.increments('id');
      collection.integer('equipmentId', { nullable: false }).index();
      collection.string('borrowerId', { length: 64, nullable: false }).index();
      collection.string('borrowerName', { length: 255, nullable: false });
      collection.datetime('borrowedAt', { nullable: false });
      collection.datetime('returnedAt', { nullable: true }).index();
      collection.text('note', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey(['equipmentId'], {
        name: 'fk_equipment_borrow_record_equipment',
        references: { collection: 'equipment' },
        onDelete: 'restrict',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('equipmentBorrowRecord');
  },
});

export default migration;
