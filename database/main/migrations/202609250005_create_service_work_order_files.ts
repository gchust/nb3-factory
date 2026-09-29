import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * App-owned file collection for repair photos and DOCX reports, plus the link
 * table that associates an uploaded file with one work order. The field set of
 * the file collection is fixed by the File Repository contract.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609250005_create_service_work_order_files',

  async up({ builder }) {
    await builder.createCollection('serviceWorkOrderFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255, nullable: false });
      collection.text('key', { nullable: false });
      collection.text('filename', { nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });

    await builder.createCollection(
      'serviceWorkOrderAttachments',
      (collection) => {
        collection.increments('id');
        collection
          .belongsTo('workOrder', 'serviceWorkOrders', {
            targetKey: 'id',
            foreignKeyType: 'integer',
            foreignKey: 'workOrderId',
          })
          .notNull();
        collection.uuid('fileId', { nullable: false });
        collection.string('category', { length: 32, nullable: false });
        collection.string('uploadedById', { length: 64, nullable: true });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.foreignKey('fileId', {
          references: { collection: 'serviceWorkOrderFiles', fields: ['id'] },
          name: 'fk_service_work_order_attachments_file',
        });
        collection.index('workOrderId');
        collection.unique(['workOrderId', 'fileId']);
      },
    );
  },

  async down({ builder }) {
    await builder.dropCollection('serviceWorkOrderAttachments');
    await builder.dropCollection('serviceWorkOrderFiles');
  },
});

export default migration;
