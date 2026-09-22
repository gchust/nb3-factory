import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/** Customers, device ledger and service-team membership. */
const migration: MigrationDefinition = defineMigration({
  name: '202609220101_create_service_customers_devices',

  async up({ builder }) {
    await builder.createCollection('serviceCustomers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.string('contactName', { length: 64 });
      collection.string('contactPhone', { length: 32 });
      collection.string('region', { length: 16, nullable: false });
      collection.text('address');
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'active',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('name');
      collection.index('region');
    });

    await builder.createCollection('serviceDevices', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: false });
      collection.string('name', { length: 128, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.string('region', { length: 16, nullable: false });
      collection.string('category', { length: 64 });
      collection.string('model', { length: 128 });
      collection.string('serialNumber', { length: 128 });
      collection.string('ownerId', { length: 64 });
      collection.boolean('enabled', { nullable: false, defaultValue: true });
      collection.datetime('purchasedAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      collection.index('customerId');
      collection.index('region');
      collection.index('category');
    });

    await builder.createCollection('serviceMembers', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64, nullable: false });
      collection.string('region', { length: 16, nullable: false });
      collection.string('teamName', { length: 64 });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('userId');
      collection.index('region');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('serviceMembers');
    await builder.dropCollection('serviceDevices');
    await builder.dropCollection('serviceCustomers');
  },
});

export default migration;
