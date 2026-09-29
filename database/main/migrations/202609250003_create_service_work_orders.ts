import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Work orders and their execution trail.
 *
 * `idempotencyKey` deduplicates a repeated submission of the same business
 * request; `externalEventId` deduplicates a device-platform report. Both are
 * nullable and unique, which SQLite and PostgreSQL both allow repeatedly.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609250003_create_service_work_orders',

  async up({ builder }) {
    await builder.createCollection('serviceWorkOrders', (collection) => {
      collection.increments('id');
      collection.string('orderNo', { length: 64, nullable: false });
      collection.string('title', { length: 255, nullable: false });
      collection.text('description', { nullable: true });
      collection.belongsTo('customer', 'serviceCustomers', {
        targetKey: 'id',
        foreignKeyType: 'integer',
        foreignKey: 'customerId',
      });
      collection.belongsTo('device', 'serviceDevices', {
        targetKey: 'id',
        foreignKeyType: 'integer',
        foreignKey: 'deviceId',
      });
      collection.string('priority', {
        length: 16,
        nullable: false,
        defaultValue: 'normal',
      });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'pending_accept',
      });
      collection.string('source', {
        length: 32,
        nullable: false,
        defaultValue: 'manual',
      });
      collection.boolean('confidential', {
        nullable: false,
        defaultValue: false,
      });
      collection.string('assigneeId', { length: 64, nullable: true });
      collection.string('acceptedById', { length: 64, nullable: true });
      collection.datetime('acceptedAt', { nullable: true });
      collection.datetime('startedAt', { nullable: true });
      collection.datetime('submittedAt', { nullable: true });
      collection.datetime('closedAt', { nullable: true });
      collection.datetime('dueAt', { nullable: true });
      collection.text('resolution', { nullable: true });
      collection.text('lastReturnReason', { nullable: true });
      collection.integer('returnCount', { nullable: false, defaultValue: 0 });
      collection.string('externalEventId', { length: 128, nullable: true });
      collection.string('idempotencyKey', { length: 128, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('orderNo');
      collection.unique('externalEventId');
      collection.unique('idempotencyKey');
      collection.index('status');
      collection.index('assigneeId');
      collection.index('deviceId');
      collection.index('customerId');
      collection.index('dueAt');
    });

    // Append-only trail of state transitions, used for the detail timeline and
    // to keep an idempotent second transition from writing a second entry.
    await builder.createCollection(
      'serviceWorkOrderActivities',
      (collection) => {
        collection.increments('id');
        collection
          .belongsTo('workOrder', 'serviceWorkOrders', {
            targetKey: 'id',
            foreignKeyType: 'integer',
            foreignKey: 'workOrderId',
          })
          .notNull();
        collection.string('action', { length: 32, nullable: false });
        collection.string('actorId', { length: 64, nullable: true });
        collection.text('note', { nullable: true });
        collection.string('fromStatus', { length: 32, nullable: true });
        collection.string('toStatus', { length: 32, nullable: true });
        collection.json('detail', { nullable: true });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.index('workOrderId');
        collection.index('action');
      },
    );

    // Temporary read-only handover of one work order to another engineer.
    await builder.createCollection('serviceWorkOrderShares', (collection) => {
      collection.increments('id');
      collection
        .belongsTo('workOrder', 'serviceWorkOrders', {
          targetKey: 'id',
          foreignKeyType: 'integer',
          foreignKey: 'workOrderId',
        })
        .notNull();
      collection.string('sharedWithId', { length: 64, nullable: false });
      collection.string('sharedById', { length: 64, nullable: true });
      collection.datetime('revokedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('workOrderId');
      collection.index('sharedWithId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('serviceWorkOrderShares');
    await builder.dropCollection('serviceWorkOrderActivities');
    await builder.dropCollection('serviceWorkOrders');
  },
});

export default migration;
