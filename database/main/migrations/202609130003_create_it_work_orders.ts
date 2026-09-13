import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Maintenance tickets and their append-only progress log.
 *
 * `reporterId` is the authenticated user that submitted the ticket; it is what scopes a regular
 * employee to their own tickets. `status` walks pending → in_progress → completed → closed and the
 * transition rule is enforced in the service, because it is business state, not a storage detail.
 * `it_work_order_files` links uploaded `it_files` rows to a ticket as repair photos.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130003_create_it_work_orders',

  async up({ builder }) {
    await builder.createCollection('it_work_orders', (collection) => {
      collection.increments('id');
      collection.string('orderNo', { length: 64, nullable: false });
      collection.string('reporterName', { length: 128, nullable: false });
      collection.string('reporterId', { length: 64, nullable: false });
      collection.integer('assetId', { nullable: true });
      collection.string('location', { length: 255, nullable: true });
      collection.text('description', { nullable: false });
      collection.string('priority', { length: 16, nullable: false });
      collection.string('status', { length: 16, nullable: false });
      collection.string('assignee', { length: 128, nullable: true });
      collection.datetime('completedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('orderNo', { name: 'uq_it_work_orders_no' });
      collection.index('reporterId', { name: 'idx_it_work_orders_reporter' });
      collection.index('status', { name: 'idx_it_work_orders_status' });
      collection.index('priority', { name: 'idx_it_work_orders_priority' });
    });

    await builder.createCollection('it_work_order_logs', (collection) => {
      collection.increments('id');
      collection.integer('workOrderId', { nullable: false });
      collection.text('content', { nullable: false });
      collection.string('authorName', { length: 128, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.index('workOrderId', { name: 'idx_it_work_order_logs_order' });
    });

    await builder.createCollection('it_work_order_files', (collection) => {
      collection.increments('id');
      collection.integer('workOrderId', { nullable: false });
      collection.string('fileId', { length: 36, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.unique(['workOrderId', 'fileId'], {
        name: 'uq_it_work_order_files_pair',
      });
      collection.index('workOrderId', {
        name: 'idx_it_work_order_files_order',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('it_work_order_files');
    await builder.dropCollection('it_work_order_logs');
    await builder.dropCollection('it_work_orders');
  },
});

export default migration;
