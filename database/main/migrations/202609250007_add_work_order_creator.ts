import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Records who opened a work order, so an external integration user can list
 * the reports they submitted without seeing anyone else's work.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609250007_add_work_order_creator',

  async up({ builder }) {
    await builder.alterCollection('serviceWorkOrders', (collection) => {
      collection.string('createdById', { length: 64, nullable: true });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('serviceWorkOrders', (collection) => {
      collection.dropField('createdById');
    });
  },
});

export default migration;
