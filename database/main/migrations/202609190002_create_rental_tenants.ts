import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/** Organizations that rent venues. */
const migration: MigrationDefinition = defineMigration({
  name: '202609190002_create_rental_tenants',

  async up({ builder }) {
    await builder.createCollection('rentalTenants', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 160, nullable: false });
      collection.string('contactName', { length: 80, nullable: false });
      collection.string('contactPhone', { length: 40, nullable: true });
      collection.string('contactEmail', { length: 160, nullable: true });
      collection.text('note', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('name');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('rentalTenants');
  },
});

export default migration;
