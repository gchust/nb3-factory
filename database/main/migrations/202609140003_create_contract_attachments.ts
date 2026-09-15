import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Contract scans.
 *
 * The first eight fields are the fixed shape the File plugin requires for a file collection: the App writes file
 * metadata through the File Repository and stores the business link (`contractId`, `versionId`) in the same row.
 * The link columns are nullable on purpose — an upload commit creates the file row before the App completes the
 * business link, and the File plugin's upload accepts no business values.
 *
 * `ownerId` mirrors the parent contract's owner so record-level authorization policies (`recordsIOwn`) can apply to
 * the attachment row directly.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609140003_create_contract_attachments',

  async up({ builder }) {
    await builder.createCollection('contractAttachments', (collection) => {
      collection.uuid('id').notNull();
      collection.string('disk', { length: 255, nullable: false });
      collection.string('key', { length: 512, nullable: false });
      collection.string('filename', { length: 255, nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });

      collection.string('contractId', { length: 64, nullable: true });
      collection.string('versionId', { length: 64, nullable: true });
      collection.string('ownerId', { length: 64, nullable: true });
      collection.string('uploadedById', { length: 64, nullable: true });
      collection.string('uploadedByName', { length: 255, nullable: true });

      collection.primary('id', { name: 'pk_contract_attachments' });
      collection.index('contractId', {
        name: 'idx_contract_attachments_contract',
      });
      collection.index('versionId', {
        name: 'idx_contract_attachments_version',
      });
      collection.index('ownerId', { name: 'idx_contract_attachments_owner' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('contractAttachments');
  },
});

export default migration;
