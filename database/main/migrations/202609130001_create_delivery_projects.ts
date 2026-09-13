import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609130001_create_delivery_projects',

  async up({ builder }) {
    await builder.createCollection('deliveryProjects', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('clientName', { length: 255, nullable: false });
      collection.string('managerId', { length: 64, nullable: true });
      // Dates are stored as ISO 8601 strings so they compare and sort
      // consistently through the database-layer query builder.
      collection.string('startDate', { length: 32, nullable: true });
      collection.string('endDate', { length: 32, nullable: true });
      collection.decimal('budgetHours', {
        precision: 10,
        scale: 2,
        nullable: true,
      });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'planning',
      });
      collection.string('createdAt', { length: 32, nullable: false });
      collection.string('updatedAt', { length: 32, nullable: false });
      collection.index('status');
      collection.index('managerId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('deliveryProjects');
  },
});

export default migration;
