import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Team document library: catalog, attachments, per-material reading grants and borrowing records.
 *
 * Self-contained on purpose. Everything the runtime reads from these tables — field names, types,
 * defaults, indexes — is spelled out here rather than imported from a definition that keeps evolving.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200001_create_library_collections',

  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.string('category', { length: 128, nullable: true });
      collection.text('summary', { nullable: true });
      collection.string('owner', { length: 128, nullable: true });
      collection.boolean('borrowable', { nullable: false }).defaultTo(false);
      collection.integer('totalCopies', { nullable: false }).defaultTo(0);
      // Kept in step with `totalCopies` and active borrowings so a confirm can decrement it atomically.
      collection.integer('availableCopies', { nullable: false }).defaultTo(0);
      // 'all' — every signed-in member may read; 'restricted' — only the members listed in material_readers.
      collection
        .string('visibility', { length: 32, nullable: false })
        .defaultTo('all');
      collection.uuid('coverFileId', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('category');
      collection.index('visibility');
    });

    // File collection consumed by @nocobase/app-plugin-file. The plugin requires these exact columns.
    await builder.createCollection('materialFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255, nullable: false });
      collection.text('key', { nullable: false });
      collection.text('filename', { nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      // Application-owned columns. All nullable or defaulted because an upload supplies no business values.
      collection.integer('materialId', { nullable: true });
      collection
        .string('role', { length: 32, nullable: false })
        .defaultTo('attachment');
      collection.string('uploaderId', { length: 64, nullable: true });
      collection.string('uploaderName', { length: 255, nullable: true });
      collection.index('materialId');
      collection.unique('key');
    });

    await builder.createCollection('materialReaders', (collection) => {
      collection.increments('id');
      collection.integer('materialId', { nullable: false });
      collection.string('userId', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.unique(['materialId', 'userId']);
      collection.index('userId');
    });

    await builder.createCollection('materialBorrowings', (collection) => {
      collection.increments('id');
      collection.integer('materialId', { nullable: false });
      collection.string('userId', { length: 64, nullable: false });
      collection.string('borrowerName', { length: 255, nullable: true });
      // pending | borrowed | returned | cancelled
      collection.string('status', { length: 32, nullable: false });
      collection.datetime('requestedAt', { nullable: false });
      collection.datetime('borrowedAt', { nullable: true });
      collection.datetime('returnedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('materialId');
      collection.index('userId');
      collection.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('materialBorrowings');
    await builder.dropCollection('materialReaders');
    await builder.dropCollection('materialFiles');
    await builder.dropCollection('materials');
  },
});

export default migration;
