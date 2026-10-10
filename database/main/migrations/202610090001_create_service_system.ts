import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Equipment after-sales service and inspection collaboration schema.
 *
 * This migration is immutable history: every field, index and foreign key is
 * spelled out here and the file must not import a live Collection definition.
 * `user` and `customers`/`devices` ids are described by previous migrations
 * (the authentication plugin creates `user` with a 64-char string id), so the
 * user-referencing columns are strings.
 *
 * The user references are deliberately plain columns rather than `belongsTo`
 * relations: `user` is provided by the authentication plugin, and a migration
 * must not fail relation validation when the app is composed without it (for
 * example the runtime-composition test). Relations between application-owned
 * collections are still declared and enforced.
 */
// Relation chains hand `onDelete` straight to the schema adapter, which
// uppercases it (`fluent/index.js` → `schema/internal/knex/adapter.js`), unlike
// constraint objects, whose values go through `resolveReferentialAction`. The
// SQL spelling is therefore what this chain must receive: `'set null'`, not
// `'setNull'` (which would emit `SETNULL`, a syntax error).
const SET_NULL = 'set null' as never;

const migration: MigrationDefinition = defineMigration({
  name: '202610090001_create_service_system',
  async up({ builder }) {
    // Engineer groups (equipment after-sales teams). One engineer per group in
    // the delivered seed, but the schema does not restrict membership size.
    await builder.createCollection('service_groups', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 32 }).notNull();
      collection.string('name', { length: 64 }).notNull();
      collection.text('description').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('code', { name: 'uq_service_groups_code' });
    });

    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128 }).notNull();
      collection.string('contactName', { length: 64 }).nullable();
      collection.string('contactPhone', { length: 64 }).nullable();
      collection.string('address', { length: 255 }).nullable();
      collection.text('remark').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('name', { name: 'idx_customers_name' });
    });

    await builder.createCollection('devices', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull();
      collection.string('name', { length: 128 }).notNull();
      collection.string('model', { length: 128 }).nullable();
      collection
        .belongsTo('customer', 'customers')
        .targetKey('id')
        .foreignKey('customerId')
        .foreignKeyType('integer')
        .notNull()
        .constraints(true)
        .onDelete('restrict');
      collection.string('engineerId', { length: 64 }).nullable();
      collection
        .belongsTo('group', 'service_groups')
        .targetKey('id')
        .foreignKey('groupId')
        .foreignKeyType('integer')
        .constraints(true)
        .onDelete(SET_NULL);
      collection.boolean('enabled').notNull().defaultTo(true);
      collection.datetime('nextInspectionDate').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('code', { name: 'uq_devices_code' });
      collection.index('customerId', { name: 'idx_devices_customer' });
      collection.index('engineerId', { name: 'idx_devices_engineer' });
      collection.index('nextInspectionDate', {
        name: 'idx_devices_next_inspection',
      });
    });

    await builder.createCollection('service_orders', (collection) => {
      collection.increments('id');
      collection.string('orderNo', { length: 64 }).notNull();
      collection.string('title', { length: 200 }).notNull();
      collection
        .belongsTo('customer', 'customers')
        .targetKey('id')
        .foreignKey('customerId')
        .foreignKeyType('integer')
        .notNull()
        .constraints(true)
        .onDelete('restrict');
      collection
        .belongsTo('device', 'devices')
        .targetKey('id')
        .foreignKey('deviceId')
        .foreignKeyType('integer')
        .notNull()
        .constraints(true)
        .onDelete('restrict');
      collection.text('description').nullable();
      collection
        .string('priority', { length: 16 })
        .notNull()
        .defaultTo('normal');
      collection.datetime('dueAt').nullable();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection
        .belongsTo('group', 'service_groups')
        .targetKey('id')
        .foreignKey('groupId')
        .foreignKeyType('integer')
        .constraints(true)
        .onDelete(SET_NULL);
      collection.boolean('confidential').notNull().defaultTo(false);
      // Workflow state machine: pending_acceptance -> pending_processing ->
      // processing -> pending_confirmation -> closed, with returnReason only
      // meaningful on the pending_confirmation -> pending_processing return.
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending_acceptance');
      collection.text('acceptanceNote').nullable();
      collection.text('resolution').nullable();
      collection.text('returnReason').nullable();
      collection.datetime('acceptedAt').nullable();
      collection.datetime('processingAt').nullable();
      collection.datetime('submittedAt').nullable();
      collection.datetime('closedAt').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      // `internal` for the app, `platform` for the device platform interface.
      collection
        .string('source', { length: 16 })
        .notNull()
        .defaultTo('internal');
      collection.string('externalEventId', { length: 191 }).nullable();
      // An observer may read the order only when a supervisor explicitly
      // enables this and the order is not confidential.
      collection.boolean('observerVisible').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('orderNo', { name: 'uq_service_orders_no' });
      collection.unique('externalEventId', {
        name: 'uq_service_orders_external_event',
      });
      collection.index('status', { name: 'idx_service_orders_status' });
      collection.index('assigneeId', { name: 'idx_service_orders_assignee' });
      collection.index('customerId', { name: 'idx_service_orders_customer' });
      collection.index('deviceId', { name: 'idx_service_orders_device' });
      collection.index('dueAt', { name: 'idx_service_orders_due' });
    });

    await builder.createCollection('service_order_logs', (collection) => {
      collection.increments('id');
      collection
        .belongsTo('order', 'service_orders')
        .targetKey('id')
        .foreignKey('orderId')
        .foreignKeyType('integer')
        .notNull()
        .constraints(true)
        .onDelete('cascade');
      collection.string('action', { length: 32 }).notNull();
      collection.string('status', { length: 24 }).notNull();
      collection.text('message').nullable();
      collection.json('detail').nullable();
      collection.string('actorId', { length: 64 }).nullable();
      // Deduplication key for retried actions and inbound platform events.
      collection.string('idempotencyKey', { length: 191 }).notNull();
      collection.datetime('startedAt').nullable();
      collection.datetime('finishedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.unique('idempotencyKey', {
        name: 'uq_service_order_logs_idempotency',
      });
      collection.index('orderId', { name: 'idx_service_order_logs_order' });
      collection.index('action', { name: 'idx_service_order_logs_action' });
    });

    await builder.createCollection('service_order_shares', (collection) => {
      collection.increments('id');
      collection
        .belongsTo('order', 'service_orders')
        .targetKey('id')
        .foreignKey('orderId')
        .foreignKeyType('integer')
        .notNull()
        .constraints(true)
        .onDelete('cascade');
      collection.string('engineerId', { length: 64 }).notNull();
      collection.string('grantedById', { length: 64 }).notNull();
      collection.text('note').nullable();
      // A share is temporary twice over: it can be revoked, and it can carry a
      // moment after which it stops counting without anyone acting.
      collection.datetime('expiresAt').nullable();
      collection.datetime('revokedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('orderId', { name: 'idx_service_order_shares_order' });
      collection.index('engineerId', {
        name: 'idx_service_order_shares_engineer',
      });
    });

    await builder.createCollection('service_inspections', (collection) => {
      collection.increments('id');
      collection
        .belongsTo('device', 'devices')
        .targetKey('id')
        .foreignKey('deviceId')
        .foreignKeyType('integer')
        .notNull()
        .constraints(true)
        .onDelete('cascade');
      collection.string('assigneeId', { length: 64 }).nullable();
      collection.date('plannedDate').notNull();
      collection
        .string('status', { length: 16 })
        .notNull()
        .defaultTo('pending');
      collection.text('result').nullable();
      collection.string('resultCode', { length: 24 }).nullable();
      collection.datetime('completedAt').nullable();
      collection
        .string('source', { length: 16 })
        .notNull()
        .defaultTo('scheduler');
      collection.string('idempotencyKey', { length: 191 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('idempotencyKey', {
        name: 'uq_service_inspections_idempotency',
      });
      collection.unique(['deviceId', 'plannedDate'], {
        name: 'uq_service_inspections_device_date',
      });
      collection.index('status', { name: 'idx_service_inspections_status' });
      collection.index('plannedDate', {
        name: 'idx_service_inspections_planned',
      });
    });

    await builder.createCollection('repair_knowledge', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200 }).notNull();
      collection.text('content').notNull();
      collection.string('category', { length: 64 }).nullable();
      collection.string('status', { length: 16 }).notNull().defaultTo('draft');
      collection.string('authorId', { length: 64 }).nullable();
      collection.datetime('publishedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('status', { name: 'idx_repair_knowledge_status' });
    });

    await builder.createCollection('device_manuals', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200 }).notNull();
      collection.string('fileName', { length: 255 }).notNull();
      collection.text('content').notNull();
      collection
        .belongsTo('device', 'devices')
        .targetKey('id')
        .foreignKey('deviceId')
        .foreignKeyType('integer')
        .constraints(true)
        .onDelete(SET_NULL);
      // uploaded -> processing -> ready | failed, reflecting the real AI
      // knowledge-base ingestion state instead of assuming success.
      collection
        .string('status', { length: 24 })
        .notNull()
        .defaultTo('uploaded');
      collection.text('failureReason').nullable();
      collection.string('aiDocumentId', { length: 191 }).nullable();
      collection.string('uploadedById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('status', { name: 'idx_device_manuals_status' });
    });

    // Business attachment table for the File plugin Repository. The id is a
    // UUID generated by the upload path, and the business columns are nullable
    // because an upload commits metadata before the business form is saved.
    await builder.createCollection('service_order_files', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection
        .belongsTo('order', 'service_orders')
        .targetKey('id')
        .foreignKey('orderId')
        .foreignKeyType('integer')
        .constraints(true)
        .onDelete('cascade');
      // `photo` for PNG inspection photos, `report` for DOCX repair reports.
      collection.string('category', { length: 16 }).nullable();
      collection.string('uploadedById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('orderId', { name: 'idx_service_order_files_order' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('service_order_files');
    await builder.dropCollection('device_manuals');
    await builder.dropCollection('repair_knowledge');
    await builder.dropCollection('service_inspections');
    await builder.dropCollection('service_order_shares');
    await builder.dropCollection('service_order_logs');
    await builder.dropCollection('service_orders');
    await builder.dropCollection('devices');
    await builder.dropCollection('customers');
    await builder.dropCollection('service_groups');
  },
});

export default migration;
