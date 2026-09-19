import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Links a stored file to the business record that owns it.
 *
 * Exactly one of `bookingId` / `venueId` is set. `kind` names the slot:
 * `cover` and `gallery` for venues; `agreement`, `supplement`,
 * `deliveryPhoto`, `deliveryPdf`, `returnPhoto` and `returnPdf` for bookings.
 * `fileId` is unique because a file belongs to exactly one slot, which keeps a
 * filename from leaking into a record it was not attached to.
 *
 * Plain integer ids rather than foreign keys, matching the other rental
 * tables, so the module stays independent of the authentication schema.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190005_create_rental_attachments',

  async up({ builder }) {
    await builder.createCollection('rentalAttachments', (collection) => {
      collection.increments('id');
      collection.integer('bookingId', { nullable: true });
      collection.integer('venueId', { nullable: true });
      collection.string('kind', { length: 32, nullable: false });
      collection.string('fileId', { length: 36, nullable: false });
      collection.integer('sort', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });

      collection.unique('fileId');
      collection.index('bookingId');
      collection.index('venueId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('rentalAttachments');
  },
});

export default migration;
