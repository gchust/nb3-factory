import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// The file repository requires this fixed shape: a 36-character uuid primary
// key, the disk/key/filename/ext/mimeType/size columns and both timestamps.
// Mapping other shapes is unsupported, so the columns are spelled out here.
const migration: MigrationDefinition = defineMigration({
  name: '202609130005_create_hr_attachments',

  async up({ builder }) {
    await builder.createCollection('hrAttachments', (collection) => {
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
    await builder.dropCollection('hrAttachments');
  },
});

export default migration;
