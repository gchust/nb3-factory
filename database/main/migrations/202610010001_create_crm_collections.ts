import { defineMigration } from '@nocobase/db';

/**
 * Creates the CRM tables: customers, their contacts and their opportunities.
 *
 * Self-contained by design: every field, relation and index is spelled out here
 * so an already-applied migration keeps meaning exactly what it meant the day
 * it ran. Nothing in this file imports a Collection definition or runtime code.
 */
export default defineMigration({
  name: '202610010001_create_crm_collections',

  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 200, nullable: false });
      collection.string('industry', { length: 100 });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('name', { name: 'crm_customers_name_idx' });
    });

    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 200, nullable: false });
      collection.string('phone', { length: 50 });
      collection.string('email', { length: 200 });
      collection.integer('customerId', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerId', { name: 'crm_contacts_customer_idx' });
      collection
        .belongsTo('customer', 'customers', {
          foreignKey: 'customerId',
          constraints: true,
          onDelete: 'cascade',
          onUpdate: 'cascade',
        })
        .targetKey('id');
    });

    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 200, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.string('stage', {
        length: 32,
        nullable: false,
        defaultValue: 'following',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerId', {
        name: 'crm_opportunities_customer_idx',
      });
      collection.index('stage', { name: 'crm_opportunities_stage_idx' });
      collection
        .belongsTo('customer', 'customers', {
          foreignKey: 'customerId',
          constraints: true,
          onDelete: 'cascade',
          onUpdate: 'cascade',
        })
        .targetKey('id');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('opportunities');
    await builder.dropCollection('contacts');
    await builder.dropCollection('customers');
  },
});
