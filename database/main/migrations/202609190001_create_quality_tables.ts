import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Quality inspection domain: products, production batches, inspection tasks and
 * their check items, and the nonconformances raised by failed items.
 *
 * Every structure this schema needs is spelled out here; nothing is imported
 * from runtime code so the migration keeps meaning the same thing after it has
 * been applied.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190001_create_quality_tables',

  async up({ builder }) {
    await builder.createCollection('products', (collection) => {
      collection.string('id', { length: 64, nullable: false });
      collection.string('code', { length: 64, nullable: false });
      collection.string('name', { length: 255, nullable: false });
      collection.string('specification', { length: 255, nullable: true });
      collection.string('unit', { length: 32, nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.primary('id');
      collection.unique('code');
      collection.index('status');
    });

    await builder.createCollection('productionBatches', (collection) => {
      collection.string('id', { length: 64, nullable: false });
      collection.string('batchNo', { length: 64, nullable: false });
      collection.string('productId', { length: 64, nullable: false });
      collection.integer('quantity', { nullable: false });
      collection.string('productionLine', { length: 64, nullable: true });
      collection.datetime('producedAt', { nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.string('createdById', { length: 64, nullable: false });
      collection.text('remark', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.primary('id');
      collection.unique('batchNo');
      collection.foreignKey('productId', {
        references: { collection: 'products', fields: ['id'] },
      });
      collection.index('productId');
      collection.index('status');
    });

    await builder.createCollection('inspectionTasks', (collection) => {
      collection.string('id', { length: 64, nullable: false });
      collection.string('taskNo', { length: 64, nullable: false });
      collection.string('batchId', { length: 64, nullable: false });
      collection.string('productId', { length: 64, nullable: false });
      collection.string('inspectorId', { length: 64, nullable: false });
      collection.string('supervisorId', { length: 64, nullable: false });
      collection.string('assignedLeadId', { length: 64, nullable: true });
      collection.integer('sampleSize', { nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.string('result', { length: 32, nullable: true });
      collection.text('remark', { nullable: true });
      collection.datetime('submittedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.primary('id');
      collection.unique('taskNo');
      collection.foreignKey('batchId', {
        references: { collection: 'productionBatches', fields: ['id'] },
      });
      collection.foreignKey('productId', {
        references: { collection: 'products', fields: ['id'] },
      });
      collection.index('batchId');
      collection.index('productId');
      collection.index('inspectorId');
      collection.index('status');
    });

    await builder.createCollection('inspectionItems', (collection) => {
      collection.string('id', { length: 64, nullable: false });
      collection.string('taskId', { length: 64, nullable: false });
      collection.integer('seq', { nullable: false });
      collection.string('name', { length: 255, nullable: false });
      collection.string('method', { length: 255, nullable: true });
      collection.string('standard', { length: 255, nullable: true });
      collection.string('unit', { length: 32, nullable: true });
      collection.string('result', { length: 32, nullable: false });
      collection.string('measuredValue', { length: 64, nullable: true });
      collection.text('remark', { nullable: true });
      collection.datetime('inspectedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.primary('id');
      collection.foreignKey('taskId', {
        references: { collection: 'inspectionTasks', fields: ['id'] },
      });
      collection.index('taskId');
    });

    await builder.createCollection('nonconformances', (collection) => {
      collection.string('id', { length: 64, nullable: false });
      collection.string('code', { length: 64, nullable: false });
      collection.string('taskId', { length: 64, nullable: false });
      collection.string('itemId', { length: 64, nullable: false });
      collection.string('batchId', { length: 64, nullable: false });
      collection.string('productId', { length: 64, nullable: false });
      collection.string('title', { length: 255, nullable: false });
      collection.text('description', { nullable: true });
      collection.string('status', { length: 32, nullable: false });
      collection.string('assignedToId', { length: 64, nullable: false });
      collection.text('reason', { nullable: true });
      collection.text('measure', { nullable: true });
      collection.datetime('handledAt', { nullable: true });
      collection.string('reviewedById', { length: 64, nullable: true });
      collection.datetime('reviewedAt', { nullable: true });
      collection.text('reviewComment', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.primary('id');
      collection.unique('code');
      // One rectification per failed item: repeated submission of the same task
      // cannot create a second nonconformance for the same check item.
      collection.unique(['taskId', 'itemId']);
      collection.foreignKey('taskId', {
        references: { collection: 'inspectionTasks', fields: ['id'] },
      });
      collection.index('taskId');
      collection.index('batchId');
      collection.index('assignedToId');
      collection.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('nonconformances');
    await builder.dropCollection('inspectionItems');
    await builder.dropCollection('inspectionTasks');
    await builder.dropCollection('productionBatches');
    await builder.dropCollection('products');
  },
});

export default migration;
