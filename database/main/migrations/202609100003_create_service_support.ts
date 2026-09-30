import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Knowledge articles, manual documents and inspection plans.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609100003_create_service_support',
  async up({ builder }) {
    await builder.createCollection(
      'serviceKnowledgeArticles',
      (collection) => {
        collection.increments('id');
        collection.string('title', { length: 255, nullable: false });
        collection.string('slug', { length: 128, nullable: false });
        collection.string('category', { length: 64 });
        collection.string('deviceCategory', { length: 64 });
        collection.text('summary');
        collection.text('content', { nullable: false });
        // draft | published
        collection.string('status', {
          length: 32,
          nullable: false,
          defaultValue: 'draft',
        });
        collection.json('tags');
        collection.integer('viewCount', { nullable: false, defaultValue: 0 });
        collection.string('authorId', { length: 64 });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.unique('slug', {
          name: 'service_knowledge_articles_slug_unique',
        });
        collection.index('status', {
          name: 'service_knowledge_articles_status_idx',
        });
        collection.index('category', {
          name: 'service_knowledge_articles_category_idx',
        });
      },
      { ifNotExists: true },
    );

    await builder.createCollection(
      'serviceManuals',
      (collection) => {
        collection.increments('id');
        collection.string('title', { length: 255, nullable: false });
        collection.string('code', { length: 64, nullable: false });
        collection.string('deviceCategory', { length: 64 });
        collection.string('model', { length: 255 });
        collection.string('version', { length: 64 });
        collection.text('summary');
        collection.string('status', {
          length: 32,
          nullable: false,
          defaultValue: 'published',
        });
        collection.uuid('fileId');
        collection.string('knowledgeBaseKey', { length: 128 });
        // not_indexed | indexing | indexed | failed | blocked
        collection.string('indexStatus', {
          length: 32,
          nullable: false,
          defaultValue: 'not_indexed',
        });
        collection.text('indexError');
        collection.integer('viewCount', { nullable: false, defaultValue: 0 });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.unique('code', { name: 'service_manuals_code_unique' });
      },
      { ifNotExists: true },
    );

    await builder.createCollection(
      'serviceInspections',
      (collection) => {
        collection.increments('id');
        collection.string('code', { length: 64, nullable: false });
        collection.string('title', { length: 255, nullable: false });
        collection.datetime('scheduledDate', { nullable: false });
        // scheduled | in_progress | completed | overdue
        collection.string('status', {
          length: 32,
          nullable: false,
          defaultValue: 'scheduled',
        });
        // normal | abnormal
        collection.string('result', { length: 32 });
        collection.text('findings');
        collection.datetime('completedAt');
        collection.datetime('remindedAt');
        collection.string('createdById', { length: 64 });
        collection.string('assigneeId', { length: 64 });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.unique('code', { name: 'service_inspections_code_unique' });
        collection.index('status', {
          name: 'service_inspections_status_idx',
        });
        collection.index('scheduledDate', {
          name: 'service_inspections_scheduled_idx',
        });
        collection.index('assigneeId', {
          name: 'service_inspections_assignee_idx',
        });
        collection
          .belongsTo('customer', 'serviceCustomers')
          .foreignKey('customerId')
          .foreignKeyType('integer')
          .targetKey('id')
          .constraints(true)
          .onDelete('restrict');
        collection
          .belongsTo('device', 'serviceDevices')
          .foreignKey('deviceId')
          .foreignKeyType('integer')
          .targetKey('id')
          .constraints(true)
          .onDelete('restrict');
        collection.index('customerId', {
          name: 'service_inspections_customer_idx',
        });
        collection.index('deviceId', {
          name: 'service_inspections_device_idx',
        });
      },
      { ifNotExists: true },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('serviceInspections');
    await builder.dropCollection('serviceManuals');
    await builder.dropCollection('serviceKnowledgeArticles');
  },
});

export default migration;
