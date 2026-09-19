import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Venues available for rent. `status` is one of `available`, `maintenance`, `inactive`.
 * A venue that is not `available` cannot take new bookings.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190001_create_rental_venues',

  async up({ builder }) {
    await builder.createCollection('rentalVenues', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 120, nullable: false });
      collection.string('location', { length: 200, nullable: false });
      collection.integer('capacity', { nullable: false });
      collection.decimal('unitPrice', {
        precision: 12,
        scale: 2,
        nullable: false,
      });
      collection.string('status', { length: 32, nullable: false });
      collection.text('description', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('name');
      collection.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('rentalVenues');
  },
});

export default migration;
