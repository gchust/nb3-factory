import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Customer and device ledger for the device after-sales service and inspection
 * coordination system. Self-contained: it declares every column, index and
 * constraint it needs and never imports a live Collection definition.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609100001_create_service_ledger',
  async up({ builder }) {
    await builder.createCollection(
      'serviceCustomers',
      (collection) => {
        collection.increments('id');
        collection.string('code', { length: 64, nullable: false });
        collection.string('name', { length: 255, nullable: false });
        collection.string('contactName', { length: 255 });
        collection.string('contactPhone', { length: 64 });
        collection.text('address');
        collection.string('serviceLevel', {
          length: 32,
          nullable: false,
          defaultValue: 'standard',
        });
        collection.text('notes');
        collection.string('ownerId', { length: 64 });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.unique('code', {
          name: 'service_customers_code_unique',
        });
        collection.index('ownerId', {
          name: 'service_customers_owner_idx',
        });
      },
      { ifNotExists: true },
    );

    await builder.createCollection(
      'serviceDevices',
      (collection) => {
        collection.increments('id');
        collection.string('serialNumber', { length: 128, nullable: false });
        collection.string('name', { length: 255, nullable: false });
        collection.string('model', { length: 255 });
        collection.string('category', { length: 64 });
        collection.string('location', { length: 255 });
        collection.string('status', {
          length: 32,
          nullable: false,
          defaultValue: 'active',
        });
        collection.datetime('warrantyUntil');
        collection.text('notes');
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.unique('serialNumber', {
          name: 'service_devices_serial_unique',
        });
        collection
          .belongsTo('customer', 'serviceCustomers')
          .foreignKey('customerId')
          .foreignKeyType('integer')
          .targetKey('id')
          .constraints(true)
          .onDelete('restrict');
        collection.index('customerId', {
          name: 'service_devices_customer_idx',
        });
      },
      { ifNotExists: true },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('serviceDevices');
    await builder.dropCollection('serviceCustomers');
  },
});

export default migration;
