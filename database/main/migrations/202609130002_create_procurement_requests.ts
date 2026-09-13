import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Purchase requests and their line items. Self-contained schema history:
 * every column, index and default is spelled out here.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130002_create_procurement_requests',

  async up({ builder }) {
    await builder.createCollection('procurementRequests', (collection) => {
      collection.increments('id');
      collection.string('applicantId', { length: 64, nullable: false });
      collection.string('applicantName', { length: 128, nullable: true });
      collection.string('department', { length: 128, nullable: true });
      collection.text('description', { nullable: true });
      collection.date('expectedDate', { nullable: true });
      // draft | pending | approved | rejected
      collection.string('status', { length: 32, nullable: false });
      collection.text('rejectReason', { nullable: true });
      collection.decimal('totalAmount', {
        precision: 14,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.datetime('submittedAt', { nullable: true });
      collection.datetime('approvedAt', { nullable: true });
      collection.string('approvedById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('applicantId');
      collection.index('status');
    });

    await builder.createCollection('procurementRequestItems', (collection) => {
      collection.increments('id');
      collection.integer('requestId', { nullable: false });
      collection.string('materialName', { length: 255, nullable: false });
      collection.string('specification', { length: 255, nullable: true });
      collection.decimal('quantity', {
        precision: 14,
        scale: 2,
        nullable: false,
      });
      collection.decimal('unitPrice', {
        precision: 14,
        scale: 2,
        nullable: false,
      });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: false,
      });
      collection.index('requestId');
    });
  },

  async down({ builder }) {
    // Reverse dependency order: children before the parent table.
    await builder.dropCollection('procurementRequestItems');
    await builder.dropCollection('procurementRequests');
  },
});

export default migration;
