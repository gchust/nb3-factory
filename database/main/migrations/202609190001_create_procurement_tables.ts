import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Procurement business schema.
 *
 * Self-contained by design: every column, index and constraint is spelled out
 * here instead of importing a runtime definition, so an already-applied
 * migration keeps meaning the same thing after the application evolves.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190001_create_procurement_tables',

  async up({ builder }) {
    await builder.createCollection('suppliers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.string('contactName', { length: 64, nullable: true });
      collection.string('phone', { length: 32, nullable: true });
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'active',
      });
      collection.string('ownerId', { length: 255, nullable: false });
      collection.text('remark', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('name');
      collection.index('ownerId');
      collection.index('status');
    });

    await builder.createCollection('materials', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: false });
      collection.string('name', { length: 128, nullable: false });
      collection.string('spec', { length: 255, nullable: true });
      collection.string('unit', { length: 32, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      collection.index('name');
    });

    await builder.createCollection('purchaseOrders', (collection) => {
      collection.increments('id');
      collection.string('orderNo', { length: 64, nullable: false });
      collection.integer('supplierId', { nullable: false });
      collection.string('buyerId', { length: 255, nullable: false });
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'draft',
      });
      collection.decimal('totalAmount', {
        precision: 16,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.text('remark', { nullable: true });
      collection.text('rejectReason', { nullable: true });
      collection.datetime('submittedAt', { nullable: true });
      collection.datetime('reviewedAt', { nullable: true });
      collection.string('reviewerId', { length: 255, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('orderNo');
      collection.index('supplierId');
      collection.index('buyerId');
      collection.index('status');
    });

    await builder.createCollection('purchaseOrderItems', (collection) => {
      collection.increments('id');
      collection.integer('orderId', { nullable: false });
      collection.integer('materialId', { nullable: false });
      collection.decimal('quantity', {
        precision: 16,
        scale: 3,
        nullable: false,
      });
      collection.decimal('unitPrice', {
        precision: 16,
        scale: 2,
        nullable: false,
      });
      collection.decimal('amount', {
        precision: 18,
        scale: 2,
        nullable: false,
      });
      collection.decimal('receivedQuantity', {
        precision: 16,
        scale: 3,
        nullable: false,
        defaultValue: 0,
      });
      collection.datetime('expectedDate', { nullable: true });
      collection.text('remark', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('orderId');
      collection.index('materialId');
    });

    await builder.createCollection('goodsReceipts', (collection) => {
      collection.increments('id');
      collection.string('receiptNo', { length: 64, nullable: false });
      collection.integer('orderId', { nullable: false });
      collection.string('receivedById', { length: 255, nullable: false });
      collection.datetime('receivedAt', { nullable: false });
      collection.text('remark', { nullable: true });
      // Client generated idempotency key: a repeated save must not create a
      // second receipt. NULL is allowed so several receipts may omit it.
      collection.string('requestId', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('receiptNo');
      collection.unique('requestId');
      collection.index('orderId');
      collection.index('receivedById');
    });

    await builder.createCollection('goodsReceiptItems', (collection) => {
      collection.increments('id');
      collection.integer('receiptId', { nullable: false });
      collection.integer('orderItemId', { nullable: false });
      collection.decimal('quantity', {
        precision: 16,
        scale: 3,
        nullable: false,
      });
      collection.datetime('createdAt', { nullable: false });
      collection.index('receiptId');
      collection.index('orderItemId');
    });

    await builder.createCollection('procurementFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255, nullable: false });
      collection.text('key', { nullable: false });
      collection.text('filename', { nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });

    await builder.createCollection('procurementAttachments', (collection) => {
      collection.increments('id');
      collection.string('fileId', { length: 36, nullable: false });
      collection.string('targetType', { length: 16, nullable: false });
      collection.integer('targetId', { nullable: false });
      collection.string('category', { length: 32, nullable: false });
      collection.string('uploadedById', { length: 255, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.index(['targetType', 'targetId']);
      collection.index('fileId');
      collection.index('uploadedById');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('procurementAttachments');
    await builder.dropCollection('procurementFiles');
    await builder.dropCollection('goodsReceiptItems');
    await builder.dropCollection('goodsReceipts');
    await builder.dropCollection('purchaseOrderItems');
    await builder.dropCollection('purchaseOrders');
    await builder.dropCollection('materials');
    await builder.dropCollection('suppliers');
  },
});

export default migration;
