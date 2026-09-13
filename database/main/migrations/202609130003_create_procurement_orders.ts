import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Purchase orders and their batch goods receipts. `totalQuantity` and
 * `receivedQuantity` are maintained by the application service so the
 * over-receipt guard can be enforced, not by a database trigger.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130003_create_procurement_orders',

  async up({ builder }) {
    await builder.createCollection('procurementOrders', (collection) => {
      collection.increments('id');
      collection.string('orderNumber', { length: 64, nullable: false });
      collection.integer('requestId', { nullable: true });
      collection.integer('supplierId', { nullable: false });
      collection.string('supplierName', { length: 255, nullable: true });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: false,
      });
      collection.decimal('totalQuantity', {
        precision: 14,
        scale: 2,
        nullable: false,
      });
      collection.decimal('receivedQuantity', {
        precision: 14,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.date('orderDate', { nullable: false });
      // ordered | partial | received
      collection.string('status', { length: 32, nullable: false });
      collection.string('createdById', { length: 64, nullable: true });
      collection.string('createdByName', { length: 128, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('orderNumber');
      collection.index('requestId');
      collection.index('supplierId');
      collection.index('status');
    });

    await builder.createCollection('procurementReceipts', (collection) => {
      collection.increments('id');
      collection.integer('orderId', { nullable: false });
      collection.decimal('quantity', {
        precision: 14,
        scale: 2,
        nullable: false,
      });
      collection.date('receivedDate', { nullable: false });
      collection.string('createdById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.index('orderId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('procurementReceipts');
    await builder.dropCollection('procurementOrders');
  },
});

export default migration;
