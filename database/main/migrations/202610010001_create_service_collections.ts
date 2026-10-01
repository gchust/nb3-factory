import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// The schema for the device after-sales service and inspection collaboration system. Every table, field and
// constraint is spelled out here because a migration is immutable history: it must never resolve a live Collection
// definition that keeps evolving.
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_create_service_collections',

  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('name', { length: 255, nullable: false });
      collection.string('contactName', { length: 255 });
      collection.string('contactPhone', { length: 64 });
      collection.text('notes');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('name');
    });

    await builder.createCollection('devices', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('code', { length: 64, nullable: false });
      collection.string('name', { length: 255, nullable: false });
      collection.string('customerId', { length: 36, nullable: false });
      collection.string('serviceEngineerId', { length: 36 });
      collection.boolean('enabled', { nullable: false, defaultValue: true });
      collection.datetime('nextInspectionAt');
      collection.text('notes');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      collection.index('customerId');
      collection.index('enabled');
    });

    await builder.createCollection('workOrders', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('code', { length: 32, nullable: false });
      collection.string('title', { length: 255, nullable: false });
      collection.string('customerId', { length: 36, nullable: false });
      collection.string('deviceId', { length: 36, nullable: false });
      collection.text('problem', { nullable: false });
      collection.string('priority', {
        length: 16,
        nullable: false,
        defaultValue: 'normal',
      });
      collection.string('status', {
        length: 24,
        nullable: false,
        defaultValue: 'pending_accept',
      });
      collection.datetime('dueAt');
      collection.string('assigneeId', { length: 36 });
      collection.boolean('confidential', {
        nullable: false,
        defaultValue: false,
      });
      collection.text('acceptanceNote');
      collection.text('resolution');
      collection.text('rejectionReason');
      collection.datetime('acceptedAt');
      collection.datetime('startedAt');
      collection.datetime('submittedAt');
      collection.datetime('closedAt');
      collection.integer('submitCount', { nullable: false, defaultValue: 0 });
      collection.string('createdById', { length: 36 });
      collection.string('source', {
        length: 24,
        nullable: false,
        defaultValue: 'internal',
      });
      collection.string('externalEventNo', { length: 128 });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      collection.unique('externalEventNo');
      collection.index('status');
      collection.index('assigneeId');
      collection.index('customerId');
      collection.index('deviceId');
    });

    await builder.createCollection('workOrderEvents', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('workOrderId', { length: 36, nullable: false });
      collection.string('type', { length: 48, nullable: false });
      collection.string('actorId', { length: 36 });
      collection.text('note');
      collection.json('data');
      collection.datetime('createdAt', { nullable: false });
      collection.index('workOrderId');
      collection.index('type');
    });

    await builder.createCollection('workOrderShares', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('workOrderId', { length: 36, nullable: false });
      collection.string('engineerId', { length: 36, nullable: false });
      collection.string('sharedById', { length: 36, nullable: false });
      collection.datetime('revokedAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index(['workOrderId', 'engineerId']);
    });

    await builder.createCollection('inspections', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('deviceId', { length: 36, nullable: false });
      collection.string('plannedDate', { length: 10, nullable: false });
      collection.string('assigneeId', { length: 36 });
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'pending',
      });
      collection.text('result');
      collection.datetime('completedAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['deviceId', 'plannedDate']);
      collection.index('assigneeId');
      collection.index('plannedDate');
      collection.index('status');
    });

    await builder.createCollection('knowledgeArticles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('title', { length: 255, nullable: false });
      collection.text('body', { nullable: false });
      collection.boolean('published', { nullable: false, defaultValue: false });
      collection.string('createdById', { length: 36 });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('published');
    });

    await builder.createCollection('deviceManuals', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('title', { length: 255, nullable: false });
      collection.string('filename', { length: 255 });
      collection.text('content');
      collection.string('status', {
        length: 24,
        nullable: false,
        defaultValue: 'pending',
      });
      collection.text('failureReason');
      collection.string('knowledgeBaseKey', { length: 128 });
      collection.string('documentId', { length: 128 });
      collection.string('uploadedById', { length: 36 });
      collection.datetime('processedAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('status');
    });

    await builder.createCollection('overdueReminders', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('workOrderId', { length: 36, nullable: false });
      collection.string('assigneeId', { length: 36, nullable: false });
      collection.string('reminderDate', { length: 10, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.unique(['workOrderId', 'reminderDate']);
      collection.index('assigneeId');
    });

    await builder.createCollection('deviceIntegrationEvents', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('eventNo', { length: 128, nullable: false });
      collection.json('payload');
      collection.string('workOrderId', { length: 36 });
      collection.datetime('createdAt', { nullable: false });
      collection.unique('eventNo');
    });

    // A self-contained file collection in the shape the File Repository expects. The application owns this table and
    // its own attachment link table; upload generates id, storage key, filename and metadata.
    await builder.createCollection('workOrderFiles', (collection) => {
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

    await builder.createCollection('workOrderAttachments', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('workOrderId', { length: 36, nullable: false });
      collection.string('fileId', { length: 36, nullable: false });
      collection.string('category', {
        length: 24,
        nullable: false,
        defaultValue: 'photo',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.index('workOrderId');
      collection.unique('fileId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('workOrderAttachments');
    await builder.dropCollection('workOrderFiles');
    await builder.dropCollection('deviceIntegrationEvents');
    await builder.dropCollection('overdueReminders');
    await builder.dropCollection('deviceManuals');
    await builder.dropCollection('knowledgeArticles');
    await builder.dropCollection('inspections');
    await builder.dropCollection('workOrderShares');
    await builder.dropCollection('workOrderEvents');
    await builder.dropCollection('workOrders');
    await builder.dropCollection('devices');
    await builder.dropCollection('customers');
  },
});

export default migration;
