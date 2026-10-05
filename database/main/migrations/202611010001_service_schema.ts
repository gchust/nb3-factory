import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Equipment after-sales service and inspection collaboration schema.
 *
 * Every field, index and constraint is spelled out here on purpose: a migration
 * is immutable history, so it never imports a collection definition or any other
 * symbol that keeps evolving.
 *
 * Timestamps are declared explicitly because the Repository does not manage
 * `createdAt` / `updatedAt` automatically; application code sets them.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010001_service_schema',
  async up({ builder }) {
    // ---- Engineer groups and seats -------------------------------------
    await builder.createCollection('serviceEngineerGroups', (collection) => {
      collection.increments('id');
      collection.string('ref', { length: 64 }).notNull().unique();
      collection.string('name', { length: 128 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    // One row per business seat. `userId` links the seat to the real signed-in
    // account and is filled in by the provisioning provider after the account
    // exists, because a seed cannot create an authenticated user.
    await builder.createCollection('serviceEngineerMembers', (collection) => {
      collection.increments('id');
      collection.string('ref', { length: 64 }).notNull().unique();
      collection
        .enum('kind', {
          values: ['manager', 'engineer', 'observer', 'integrator'],
        })
        .notNull()
        .defaultTo('engineer');
      collection.integer('groupId').notNull();
      collection.string('name', { length: 128 }).notNull();
      collection.string('email', { length: 255 }).notNull().unique();
      collection.string('userId', { length: 64 });
      collection.boolean('enabled').notNull().defaultTo(true);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('groupId');
      collection.index('kind');
    });

    // ---- Customers and equipment ---------------------------------------
    await builder.createCollection('serviceCustomers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128 }).notNull();
      collection.string('contactName', { length: 128 }).notNull();
      collection.string('contactPhone', { length: 64 }).notNull();
      collection.text('address');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('name');
    });

    await builder.createCollection('serviceEquipment', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull().unique();
      collection.string('name', { length: 128 }).notNull();
      collection.string('model', { length: 128 });
      collection.string('location', { length: 255 });
      collection.integer('customerId').notNull();
      collection.integer('engineerMemberId');
      collection.boolean('enabled').notNull().defaultTo(true);
      collection.date('nextInspectionDate');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('customerId');
      collection.index('engineerMemberId');
    });

    // ---- Work orders and their closed loop -----------------------------
    await builder.createCollection('serviceWorkOrders', (collection) => {
      collection.increments('id');
      collection.string('orderNo', { length: 64 }).notNull().unique();
      collection.string('title', { length: 200 }).notNull();
      collection.integer('customerId').notNull();
      collection.integer('equipmentId').notNull();
      collection.text('problem').notNull();
      collection
        .enum('priority', { values: ['normal', 'urgent'] })
        .notNull()
        .defaultTo('normal');
      collection
        .enum('status', {
          values: [
            'pending_acceptance',
            'pending_processing',
            'processing',
            'pending_confirmation',
            'closed',
          ],
        })
        .notNull()
        .defaultTo('pending_acceptance');
      // The engineer seat this order is assigned to.
      collection.integer('assigneeId').notNull();
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.datetime('deadline');
      collection.text('acceptanceNote');
      // Acceptance runs through the Workflow plugin: the request is recorded as
      // `pending`, a triggered run as `running`, and a refused trigger as
      // `failed`. The columns are plain strings rather than an enum so a run
      // finishing later can record `accepted` without a further migration.
      collection
        .string('acceptNoteStatus', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.string('acceptanceRunId', { length: 64 });
      collection.datetime('acceptedAt');
      collection.datetime('processingStartedAt');
      collection.text('resolution');
      collection.datetime('resolutionAt');
      // Actor identities are strings: the account id is stringified before it
      // is stored, and `createdById` below is the same kind of value.
      collection.string('resolutionSubmittedById', { length: 64 });
      collection.datetime('closedAt');
      collection.string('closedById', { length: 64 });
      collection.integer('rejectCount').notNull().defaultTo(0);
      collection.text('lastRejectReason');
      collection
        .enum('source', { values: ['manual', 'external'] })
        .notNull()
        .defaultTo('manual');
      collection.string('createdById', { length: 64 });
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('status');
      collection.index('assigneeId');
      collection.index('customerId');
      collection.index('equipmentId');
      collection.index('createdAt');
    });

    // Append-only record of everything that happened to a work order. The
    // unique `eventKey` is the idempotency boundary for acceptance, state
    // transitions and external retries.
    await builder.createCollection('serviceWorkOrderEvents', (collection) => {
      collection.increments('id');
      collection.integer('workOrderId').notNull();
      collection.string('type', { length: 64 }).notNull();
      collection.string('eventKey', { length: 160 }).unique();
      collection.string('actorId', { length: 64 });
      collection.text('message');
      collection.json('detail');
      collection.string('runId', { length: 64 });
      collection.datetime('createdAt').notNull();
      collection.index('workOrderId');
      collection.index('type');
    });

    // Temporary, read-only collaboration grants for one ordinary work order.
    await builder.createCollection('serviceWorkOrderShares', (collection) => {
      collection.increments('id');
      collection.integer('workOrderId').notNull();
      collection.integer('engineerMemberId').notNull();
      collection.string('grantedById', { length: 64 });
      collection.datetime('grantedAt');
      collection.text('note');
      collection.datetime('revokedAt');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['workOrderId', 'engineerMemberId']);
    });

    // ---- Inspections ---------------------------------------------------
    await builder.createCollection('serviceInspectionTasks', (collection) => {
      collection.increments('id');
      collection.string('taskNo', { length: 64 }).notNull().unique();
      collection.integer('equipmentId').notNull();
      collection.integer('customerId').notNull();
      collection.integer('engineerMemberId').notNull();
      collection.date('planDate').notNull();
      collection.datetime('dueAt');
      collection
        .enum('status', {
          values: ['pending', 'in_progress', 'done', 'overdue'],
        })
        .notNull()
        .defaultTo('pending');
      collection.text('result');
      collection.datetime('completedAt');
      // Scheduler occurrence identity, so one day's generation never duplicates.
      collection.string('occurrenceKey', { length: 160 }).unique();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['equipmentId', 'planDate']);
      collection.index('status');
      collection.index('engineerMemberId');
    });

    // ---- Knowledge, manuals and attachments ----------------------------
    await builder.createCollection('serviceKnowledgeArticles', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200 }).notNull();
      collection.text('body').notNull();
      collection.boolean('published').notNull().defaultTo(false);
      collection.string('authorId', { length: 64 });
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('published');
    });

    await builder.createCollection('serviceManuals', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200 }).notNull();
      collection.string('equipmentModel', { length: 128 });
      collection.text('summary');
      collection.string('sourceFileId', { length: 64 });
      collection
        .enum('indexStatus', {
          values: ['not_indexed', 'pending', 'indexed', 'failed'],
        })
        .notNull()
        .defaultTo('not_indexed');
      collection.text('indexMessage');
      collection.datetime('indexedAt');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    // File metadata layout required by the File plugin: id, disk, key, filename,
    // ext, mimeType, size and both timestamps. Business columns stay nullable so
    // an upload can create the row before the business form saves the link.
    await builder.createCollection('serviceWorkOrderFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.integer('workOrderId');
      collection.string('uploaderId', { length: 64 });
      collection
        .enum('category', { values: ['photo', 'report'] })
        .notNull()
        .defaultTo('report');
      collection.index('workOrderId');
    });

    // ---- External device platform events -------------------------------
    await builder.createCollection('serviceExternalEvents', (collection) => {
      collection.increments('id');
      collection.string('eventId', { length: 160 }).notNull().unique();
      collection
        .string('source', { length: 64 })
        .notNull()
        .defaultTo('device-platform');
      collection.json('payload');
      collection.integer('workOrderId');
      collection
        .enum('status', {
          values: ['received', 'duplicate', 'accepted', 'rejected'],
        })
        .notNull()
        .defaultTo('received');
      collection.text('message');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
  },
  async down({ builder }) {
    await builder.dropCollection('serviceExternalEvents');
    await builder.dropCollection('serviceWorkOrderFiles');
    await builder.dropCollection('serviceManuals');
    await builder.dropCollection('serviceKnowledgeArticles');
    await builder.dropCollection('serviceInspectionTasks');
    await builder.dropCollection('serviceWorkOrderShares');
    await builder.dropCollection('serviceWorkOrderEvents');
    await builder.dropCollection('serviceWorkOrders');
    await builder.dropCollection('serviceEquipment');
    await builder.dropCollection('serviceCustomers');
    await builder.dropCollection('serviceEngineerMembers');
    await builder.dropCollection('serviceEngineerGroups');
  },
});

export default migration;
