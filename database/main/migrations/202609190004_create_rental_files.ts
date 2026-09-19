import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Metadata for every file stored by the rental module.
 *
 * The column set is fixed by the File Repository contract — upload composes
 * every value itself — so this collection describes storage, not business
 * ownership. A file becomes part of a booking or a venue only through the
 * `rentalAttachments` link table, which is also what the access rules read.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190004_create_rental_files',

  async up({ builder }) {
    await builder.createCollection('rentalFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
  },

  async down({ builder }) {
    await builder.dropCollection('rentalFiles');
  },
});

export default migration;
