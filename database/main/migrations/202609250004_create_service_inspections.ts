import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Scheduled inspection tasks and the device-platform event ledger.
 * `(deviceId, plannedDate)` is unique, so generating the same day's tasks twice
 * is a no-op.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609250004_create_service_inspections',

  async up({ builder }) {
    await builder.createCollection('serviceInspections', (collection) => {
      collection.increments('id');
      collection
        .belongsTo('device', 'serviceDevices', {
          targetKey: 'id',
          foreignKeyType: 'integer',
          foreignKey: 'deviceId',
        })
        .notNull();
      collection.date('plannedDate', { nullable: false });
      collection.string('assigneeId', { length: 64, nullable: true });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'pending',
      });
      collection.text('result', { nullable: true });
      collection.datetime('completedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['deviceId', 'plannedDate']);
      collection.index('status');
      collection.index('plannedDate');
    });

    await builder.createCollection('serviceExternalEvents', (collection) => {
      collection.increments('id');
      collection.string('eventId', { length: 128, nullable: false });
      collection.belongsTo('workOrder', 'serviceWorkOrders', {
        targetKey: 'id',
        foreignKeyType: 'integer',
        foreignKey: 'workOrderId',
      });
      collection.json('payload', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('eventId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('serviceExternalEvents');
    await builder.dropCollection('serviceInspections');
  },
});

export default migration;
