import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609190004_create_file_collections',

  async up({ builder }) {
    // Generic file metadata collection consumed by the File Repository services.
    // The column contract is fixed by @nocobase/app-plugin-file.
    await builder.createCollection('appFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 64, nullable: false });
      collection.text('key', { nullable: false });
      collection.text('filename', { nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });

    await builder.createCollection(
      'inspectionResultAttachments',
      (collection) => {
        collection.increments('id');
        collection.integer('taskId', { nullable: false });
        collection.integer('resultId', { nullable: false });
        collection.string('fileId', { length: 64, nullable: false });
        collection.text('note', { nullable: true });
        collection.string('uploadedById', { length: 64, nullable: false });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.index('resultId');
        collection.index('taskId');
        collection.index('fileId');
      },
    );

    await builder.createCollection('repairOrderAttachments', (collection) => {
      collection.increments('id');
      collection.integer('repairOrderId', { nullable: false });
      // 'before' and 'after' material live in the same table but never mix:
      // every read is scoped by stage.
      collection.string('stage', { length: 16, nullable: false });
      collection.string('fileId', { length: 64, nullable: false });
      collection.text('note', { nullable: true });
      collection.string('uploadedById', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('repairOrderId');
      collection.index('fileId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('repairOrderAttachments');
    await builder.dropCollection('inspectionResultAttachments');
    await builder.dropCollection('appFiles');
  },
});

export default migration;
