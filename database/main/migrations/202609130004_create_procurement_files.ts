import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * File metadata for procurement attachments plus the link table that binds a
 * stored file to a supplier or purchase request. The `procurementFiles`
 * collection shape is fixed by the File plugin — fields and types are not
 * remappable, and uploads supply no business values beyond these columns.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130004_create_procurement_files',

  async up({ builder }) {
    await builder.createCollection('procurementFiles', (collection) => {
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

    await builder.createCollection('procurementAttachments', (collection) => {
      collection.increments('id');
      // supplier | request
      collection.string('ownerType', { length: 32, nullable: false });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.string('fileId', { length: 64, nullable: false });
      collection.string('filename', { length: 512, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.index(['ownerType', 'ownerId']);
      collection.index('fileId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('procurementAttachments');
    await builder.dropCollection('procurementFiles');
  },
});

export default migration;
