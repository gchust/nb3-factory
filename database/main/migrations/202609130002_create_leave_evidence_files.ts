import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * Evidence files attached to leave requests (请假凭证).
 *
 * Follows the fixed file record contract of the File plugin (see
 * `@nocobase/app-plugin-file` shared types): uuid primary key, disk, key, filename,
 * ext, mimeType, size and timestamps, plus the `leaveRequestId` link back to the
 * requesting row. The `id` column is client-generated (uuid v4) by the file
 * repository at upload time, so this migration only declares the schema.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130002_create_leave_evidence_files',
  async up({ builder }: MigrationContext): Promise<void> {
    await builder.createCollection('leaveEvidenceFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key', { nullable: false });
      collection.text('filename', { nullable: false });
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size', { nullable: false });
      collection.integer('leaveRequestId', { nullable: true }).index();
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });
  },
  async down({ builder }: MigrationContext): Promise<void> {
    await builder.dropCollection('leaveEvidenceFiles');
  },
});

export default migration;
