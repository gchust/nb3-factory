import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Attachment metadata for the quality inspection domain, stored through the
 * file plugin's Repository so uploads, storage keys and size validation have a
 * single implementation.
 *
 * The fixed file columns (id, disk, key, filename, ext, mimeType, size,
 * createdAt, updatedAt) are the repository contract. The business columns are
 * nullable because an upload composes only the file columns; the server binds
 * them as Repository create defaults, so every stored row carries its target
 * and uploader. They are declared here rather than imported from runtime code
 * so this migration keeps meaning the same thing after it has been applied.
 *
 * `targetType`/`targetId` name the owning business record (production batch,
 * inspection item or nonconformance) and `category` the attachment group
 * inside it (on-site photo, measurement report, text note, factory report,
 * problem evidence, post-handling evidence).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190004_create_quality_attachments',

  async up({ builder }) {
    await builder.createCollection('qualityAttachments', (collection) => {
      collection.string('id', { length: 64, nullable: false });
      collection.string('disk', { length: 255, nullable: false });
      collection.text('key', { nullable: false });
      collection.text('filename', { nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });

      collection.string('targetType', { length: 32, nullable: true });
      collection.string('targetId', { length: 64, nullable: true });
      collection.string('category', { length: 32, nullable: true });
      collection.string('uploadedById', { length: 64, nullable: true });

      collection.primary('id');
      collection.index('targetType');
      collection.index(['targetType', 'targetId', 'category']);
      collection.index('uploadedById');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('qualityAttachments');
  },
});

export default migration;
