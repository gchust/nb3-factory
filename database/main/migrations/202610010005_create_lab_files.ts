import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Application-owned file storage.
 *
 * The bytes live in `content` rather than on a Drive disk for one concrete
 * reason: seeds run as static database tasks without a service container, so
 * they cannot reach a drive. Keeping the bytes in the row makes the seeded
 * nameplate photos, calibration certificates, manuals, rosters, risk notes and
 * fault reports reproducible on an empty database, and every read still passes
 * through the application's own permission check before a byte is served.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010005_create_lab_files',

  async up({ builder }) {
    await builder.createCollection('lab_files', (collection) => {
      collection.uuid('id', { primaryKey: true });
      collection.string('filename', { length: 255, nullable: false });
      collection.string('ext', { length: 32, nullable: true });
      collection.string('mimeType', { length: 128, nullable: false });
      collection.integer('size', { nullable: false, defaultValue: 0 });
      collection.string('purpose', { length: 64, nullable: true });
      collection.string('targetType', { length: 64, nullable: false });
      collection.string('targetId', { length: 191, nullable: false });
      collection.text('remark', { nullable: true });
      collection.blob('content', { nullable: true });
      collection.string('uploadedById', { length: 191, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index(['targetType', 'targetId']);
      collection.index('purpose');
      collection.index('uploadedById');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('lab_files');
  },
});

export default migration;
