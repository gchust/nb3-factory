import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Retail store schema: product catalogue, sales orders with their line items, and purchase
 * (stock-in) records.
 *
 * A migration is immutable history, so every field, index and constraint is spelled out here
 * rather than imported from a shared definition that keeps evolving.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609140001_create_retail_tables',

  async up({ builder }) {
    await builder.createCollection('retailProducts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('barcode', { length: 64, nullable: false });
      collection.string('category', { length: 32, nullable: false });
      collection.decimal('price', {
        precision: 12,
        scale: 2,
        nullable: false,
      });
      collection.decimal('cost', {
        precision: 12,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.integer('stock', { nullable: false, defaultValue: 0 });
      collection.string('status', { length: 32, nullable: false });
      // Product images are stored as a JSON encoded array of URLs in a text column so the exact
      // same migration works on every supported dialect.
      collection.text('images', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('barcode');
      collection.index('category');
      collection.index('status');
    });

    await builder.createCollection('retailSalesOrders', (collection) => {
      collection.increments('id');
      collection.string('orderNumber', { length: 64, nullable: false });
      collection.string('storeName', { length: 255, nullable: false });
      collection.string('cashierId', { length: 64, nullable: false });
      collection.string('cashierName', { length: 255, nullable: false });
      collection.decimal('originalAmount', {
        precision: 12,
        scale: 2,
        nullable: false,
      });
      collection.decimal('discountPercent', {
        precision: 5,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.decimal('discountAmount', {
        precision: 12,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.decimal('payableAmount', {
        precision: 12,
        scale: 2,
        nullable: false,
      });
      collection.string('paymentMethod', { length: 32, nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.datetime('soldAt', { nullable: false });
      collection.datetime('returnedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('orderNumber');
      collection.index('cashierId');
      collection.index('soldAt');
      collection.index('status');
    });

    await builder.createCollection('retailSalesOrderItems', (collection) => {
      collection.increments('id');
      collection.integer('orderId', { nullable: false });
      collection.integer('productId', { nullable: false });
      collection.string('productName', { length: 255, nullable: false });
      collection.string('barcode', { length: 64, nullable: true });
      collection.decimal('unitPrice', {
        precision: 12,
        scale: 2,
        nullable: false,
      });
      collection.integer('quantity', { nullable: false });
      collection.decimal('subtotal', {
        precision: 12,
        scale: 2,
        nullable: false,
      });
      collection.datetime('createdAt', { nullable: false });
      collection.index('orderId');
      collection.index('productId');
    });

    await builder.createCollection('retailPurchaseOrders', (collection) => {
      collection.increments('id');
      collection.integer('productId', { nullable: false });
      collection.string('productName', { length: 255, nullable: false });
      collection.integer('quantity', { nullable: false });
      collection.decimal('unitCost', {
        precision: 12,
        scale: 2,
        nullable: false,
      });
      collection.string('supplier', { length: 255, nullable: true });
      collection.datetime('purchaseDate', { nullable: false });
      collection.string('createdById', { length: 64, nullable: false });
      collection.string('createdByName', { length: 255, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.index('productId');
      collection.index('purchaseDate');
    });
  },

  async down({ builder }) {
    // Reverse in dependency order: line items reference orders, purchases reference products.
    await builder.dropCollection('retailSalesOrderItems');
    await builder.dropCollection('retailSalesOrders');
    await builder.dropCollection('retailPurchaseOrders');
    await builder.dropCollection('retailProducts');
  },
});

export default migration;
