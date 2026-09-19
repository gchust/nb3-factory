import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609190003_create_repair_orders',

  async up({ builder }) {
    await builder.createCollection('repairOrders', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: false });
      collection.integer('equipmentId', { nullable: false });
      collection.integer('sourceResultId', { nullable: false });
      // A work order is created by the inspection submit, before an equipment
      // manager has picked a repairer; it stays unassigned until one is chosen.
      collection.string('assigneeId', { length: 64, nullable: true });
      collection.string('priority', { length: 16, nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.text('description', { nullable: true });
      collection.string('createdById', { length: 64, nullable: true });
      collection.string('reviewedById', { length: 64, nullable: true });
      collection.text('reviewRemark', { nullable: true });
      collection.datetime('closedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      // One repair order per abnormal inspection result, so re-submitting a task
      // cannot produce a duplicate order.
      collection.unique('sourceResultId');
      collection.index('assigneeId');
      collection.index('status');
      collection.index('equipmentId');
    });

    await builder.createCollection('repairOrderRecords', (collection) => {
      collection.increments('id');
      collection.integer('repairOrderId', { nullable: false });
      collection.string('authorId', { length: 64, nullable: false });
      collection.text('content', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.index('repairOrderId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('repairOrderRecords');
    await builder.dropCollection('repairOrders');
  },
});

export default migration;
