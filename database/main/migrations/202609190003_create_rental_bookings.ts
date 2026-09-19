import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A rental booking. One row is one tenancy of one venue for a time window.
 *
 * Status flow:
 *   pending -> confirmed -> delivered -> returned -> settled
 *   pending | confirmed -> cancelled
 *
 * `cancelled` releases the time window for new bookings; every other status
 * keeps it reserved. Venue and tenant are stored as plain ids and validated by
 * the domain service; there is no cross-table foreign key so the rental tables
 * stay independent of changes in the authentication schema.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190003_create_rental_bookings',

  async up({ builder }) {
    await builder.createCollection('rentalBookings', (collection) => {
      collection.increments('id');
      collection.string('reference', { length: 64, nullable: false });
      collection.integer('venueId', { nullable: false });
      collection.integer('tenantId', { nullable: false });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.string('title', { length: 200, nullable: false });
      collection.datetime('startAt', { nullable: false });
      collection.datetime('endAt', { nullable: false });
      collection.decimal('fee', {
        precision: 12,
        scale: 2,
        nullable: false,
      });
      collection.string('status', { length: 32, nullable: false });
      collection.text('note', { nullable: true });

      // Delivery handover
      collection.text('deliveryCondition', { nullable: true });
      collection.datetime('deliveredAt', { nullable: true });

      // Return handover
      collection.text('returnCondition', { nullable: true });
      collection.datetime('returnedAt', { nullable: true });
      collection.text('damageNote', { nullable: true });
      collection.decimal('damageFee', {
        precision: 12,
        scale: 2,
        nullable: true,
      });

      // Confirmation and settlement
      collection.datetime('confirmedAt', { nullable: true });
      collection.datetime('settledAt', { nullable: true });

      // Cancellation
      collection.text('cancelReason', { nullable: true });
      collection.datetime('cancelledAt', { nullable: true });

      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });

      collection.unique('reference');
      collection.index('venueId');
      collection.index('tenantId');
      collection.index('ownerId');
      collection.index('status');
      collection.index('startAt');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('rentalBookings');
  },
});

export default migration;
