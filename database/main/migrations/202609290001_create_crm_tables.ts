import { defineMigration } from '@nocobase/db';

/**
 * CRM core tables: customers, contacts and opportunities.
 *
 * Timestamps are nullable and written by the service layer. The database does
 * not have a portable "now()" default and the application is the only writer.
 */
const migration = defineMigration({
  name: '202609290001_create_crm_tables',
  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 120, nullable: false });
      collection.string('industry', { length: 120 });
      collection.datetime('createdAt');
      collection.datetime('updatedAt');
      collection.index('name', { name: 'crm_customers_name_idx' });
    });

    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 120, nullable: false });
      collection.string('phone', { length: 60 });
      collection.string('email', { length: 160 });
      collection.integer('customerId', { nullable: false });
      collection.datetime('createdAt');
      collection.datetime('updatedAt');
      collection.index('customerId', { name: 'crm_contacts_customer_idx' });
      collection
        .belongsTo('customer', 'customers')
        .targetKey('id')
        .foreignKey('customerId')
        .constraints(true)
        .onDelete('cascade');
    });

    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 160, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      // Business values: following | won | lost.
      collection.string('stage', { length: 20, nullable: false });
      collection.datetime('createdAt');
      collection.datetime('updatedAt');
      collection.index('customerId', {
        name: 'crm_opportunities_customer_idx',
      });
      collection.index('stage', { name: 'crm_opportunities_stage_idx' });
      collection
        .belongsTo('customer', 'customers')
        .targetKey('id')
        .foreignKey('customerId')
        .constraints(true)
        .onDelete('cascade');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('opportunities');
    await builder.dropCollection('contacts');
    await builder.dropCollection('customers');
  },
});

export default migration;
