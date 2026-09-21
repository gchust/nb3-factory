import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Maintenance work orders and the append-only event trail that records every
 * status transition together with the reviewer comment the transition carried.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010003_create_maintenance_tables',

  async up({ builder }) {
    await builder.createCollection('work_orders', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: false });
      collection.integer('equipmentId', { nullable: false });
      collection.integer('labId', { nullable: false });
      collection.string('title', { length: 200, nullable: false });
      collection.text('description', { nullable: true });
      collection.string('type', {
        length: 32,
        nullable: false,
        defaultValue: 'repair',
      });
      collection.string('priority', {
        length: 32,
        nullable: false,
        defaultValue: 'normal',
      });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'open',
      });
      collection.string('assigneeId', { length: 191, nullable: true });
      collection.string('createdById', { length: 191, nullable: true });
      collection.datetime('resolvedAt', { nullable: true });
      collection.text('reviewComment', { nullable: true });
      collection.string('reviewedById', { length: 191, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      collection.index('equipmentId');
      collection.index('labId');
      collection.index('status');
      collection.index('assigneeId');
      collection.foreignKey(['equipmentId'], {
        references: { collection: 'equipment', fields: ['id'] },
        onDelete: 'restrict',
      });
      collection.foreignKey(['labId'], {
        references: { collection: 'laboratories', fields: ['id'] },
        onDelete: 'restrict',
      });
    });

    await builder.createCollection('work_order_events', (collection) => {
      collection.increments('id');
      collection.integer('workOrderId', { nullable: false });
      collection.string('action', { length: 64, nullable: false });
      collection.string('fromStatus', { length: 32, nullable: true });
      collection.string('toStatus', { length: 32, nullable: true });
      collection.text('comment', { nullable: true });
      collection.string('actorId', { length: 191, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.index('workOrderId');
      collection.foreignKey(['workOrderId'], {
        references: { collection: 'work_orders', fields: ['id'] },
        onDelete: 'cascade',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('work_order_events');
    await builder.dropCollection('work_orders');
  },
});

export default migration;
