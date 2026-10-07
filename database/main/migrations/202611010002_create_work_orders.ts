import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Work orders, their persisted execution log, temporary read-only shares and the
 * repair knowledge base.
 *
 * `workOrderExecutions.idempotencyKey` is unique: it is what makes acceptance and
 * every later transition safe to retry with the same request id.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010002_create_work_orders',

  async up({ builder }) {
    await builder.createCollection('workOrders', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('orderNo', { length: 64 }).notNull();
      c.string('title', { length: 200 }).notNull();
      c.text('description').nullable();
      // pending_acceptance | pending_processing | processing | pending_confirmation | closed
      c.string('status', { length: 32 })
        .notNull()
        .defaultTo('pending_acceptance');
      // normal | urgent
      c.string('priority', { length: 16 }).notNull().defaultTo('normal');
      c.boolean('confidential').notNull().defaultTo(false);
      // manual | external
      c.string('source', { length: 16 }).notNull().defaultTo('manual');
      c.string('externalEventNo', { length: 128 }).nullable();
      c.string('customerId', { length: 64 }).nullable();
      c.string('deviceId', { length: 64 }).nullable();
      c.string('groupId', { length: 64 }).nullable();
      c.string('assigneeId', { length: 64 }).nullable();
      c.string('createdById', { length: 64 }).nullable();
      c.string('faultCategory', { length: 64 }).nullable();
      c.datetime('acceptedAt').nullable();
      c.datetime('processingAt').nullable();
      c.datetime('submittedAt').nullable();
      c.datetime('confirmedAt').nullable();
      c.datetime('closedAt').nullable();
      c.text('closeSummary').nullable();
      c.text('failureReason').nullable();
      c.integer('reopenCount').notNull().defaultTo(0);
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.unique('orderNo');
      c.unique('externalEventNo');
      c.index('status');
      c.index('assigneeId');
      c.index('deviceId');
      c.index('customerId');
      c.index('createdAt');
    });

    await builder.createCollection('workOrderExecutions', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('workOrderId', { length: 64 }).notNull();
      // accept | start | submit | confirm | close | reject | reopen | assign | share | attach
      c.string('action', { length: 32 }).notNull();
      c.string('fromStatus', { length: 32 }).nullable();
      c.string('toStatus', { length: 32 }).notNull();
      c.string('operatorId', { length: 64 }).nullable();
      c.string('idempotencyKey', { length: 128 }).nullable();
      c.string('result', { length: 16 }).notNull().defaultTo('succeeded');
      c.text('failureReason').nullable();
      c.text('detail').nullable();
      c.integer('attempt').notNull().defaultTo(1);
      c.datetime('createdAt').notNull();
      c.unique('idempotencyKey');
      c.index('workOrderId');
      c.index('action');
    });

    await builder.createCollection('workOrderShares', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('workOrderId', { length: 64 }).notNull();
      c.string('sharedWithId', { length: 64 }).notNull();
      c.string('sharedById', { length: 64 }).nullable();
      c.text('note').nullable();
      c.datetime('expiresAt').nullable();
      c.boolean('active').notNull().defaultTo(true);
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.unique(['workOrderId', 'sharedWithId']);
      c.index('sharedWithId');
    });

    await builder.createCollection('repairNotes', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('title', { length: 200 }).notNull();
      c.text('body').notNull();
      c.string('deviceModel', { length: 120 }).nullable();
      c.string('faultCategory', { length: 64 }).nullable();
      c.string('authorId', { length: 64 }).nullable();
      // draft | published
      c.string('status', { length: 16 }).notNull().defaultTo('draft');
      c.datetime('publishedAt').nullable();
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.index('status');
      c.index('deviceModel');
    });

    await builder.createCollection('deviceManuals', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('title', { length: 200 }).notNull();
      c.string('modelName', { length: 120 }).nullable();
      c.string('version', { length: 32 }).nullable();
      c.string('docNo', { length: 64 }).nullable();
      c.text('summary').nullable();
      // Relative storage key of the source document the knowledge base indexes.
      c.string('fileKey', { length: 500 }).nullable();
      c.string('fileName', { length: 255 }).nullable();
      // draft | published | indexed | failed
      c.string('status', { length: 16 }).notNull().defaultTo('draft');
      c.text('indexMessage').nullable();
      c.datetime('publishedAt').nullable();
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.index('modelName');
      c.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('deviceManuals');
    await builder.dropCollection('repairNotes');
    await builder.dropCollection('workOrderShares');
    await builder.dropCollection('workOrderExecutions');
    await builder.dropCollection('workOrders');
  },
});

export default migration;
