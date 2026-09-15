import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Two collections make up the media library:
//  - `mediaFiles` uses the fixed field contract required by the File plugin Repository
//    (id/disk/key/filename/ext/mimeType/size/createdAt/updatedAt). It stores the bytes and
//    the storage metadata; the plugin refuses a collection that does not match this contract.
//  - `mediaAssets` is the application's business record: name, category, tags, status and a
//    denormalized copy of the file metadata so lists and statistics read one table.
const migration: MigrationDefinition = defineMigration({
  name: '202609140001_create_media_library',

  async up({ builder }) {
    await builder.createCollection('mediaFiles', (collection) => {
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

    await builder.createCollection('mediaAssets', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255 }).notNull();
      // image | audio | video | document
      collection.string('type', { length: 32 }).notNull();
      // Canonical comma-delimited tag list with a leading and a trailing comma, so a single tag
      // can be matched exactly with a LIKE '%,tag,%' filter instead of a fragile substring match.
      collection.text('tags');
      // available | disabled
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'available',
      });
      collection.string('fileId', { length: 36 }).notNull();
      collection.string('filename', { length: 255 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.bigInt('size').notNull();
      collection.string('uploaderId', { length: 36 });
      collection.string('uploaderName', { length: 255 });
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('fileId');
      collection.index('type');
      collection.index('status');
      collection.index('createdAt');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('mediaAssets');
    await builder.dropCollection('mediaFiles');
  },
});

export default migration;
