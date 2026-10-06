import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Customer, contact and opportunity tables for the sales workspace.
 *
 * Self-contained by design: every field, index and foreign key this application needs is spelled out here rather than
 * derived from a Collection definition, so a later change to the domain does not change what this migration means.
 *
 * Ids are UUID strings, matching the rest of the application's records (the authentication tables and the mail plugin
 * both use string ids), so a record's id is a string in every layer and no numeric conversion is ever needed.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_create_crm_tables',
  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.uuid('id').primary();
      collection.string('name', { length: 120, nullable: false });
      collection.string('industry', { length: 120 });
      collection.datetimeTz('createdAt', { nullable: false });
      collection.datetimeTz('updatedAt', { nullable: false });
      collection.index('name', { name: 'crm_customers_name_idx' });
    });

    await builder.createCollection('contacts', (collection) => {
      collection.uuid('id').primary();
      collection.string('name', { length: 120, nullable: false });
      /** How to reach the contact: a phone number, an email address, a handle. */
      collection.string('contact', { length: 200 });
      collection.uuid('customerId', { nullable: false });
      collection.datetimeTz('createdAt', { nullable: false });
      collection.datetimeTz('updatedAt', { nullable: false });
      collection.index('customerId', { name: 'crm_contacts_customer_idx' });
      collection.index('name', { name: 'crm_contacts_name_idx' });
      collection
        .belongsTo('customer', 'customers', { index: false })
        .targetKey('id')
        .foreignKey('customerId')
        .constraints(true)
        .onDelete('cascade');
    });

    await builder.createCollection('opportunities', (collection) => {
      collection.uuid('id').primary();
      collection.string('name', { length: 160, nullable: false });
      collection.uuid('customerId', { nullable: false });
      collection.decimal('amount', {
        precision: 18,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      /**
       * The three stages the sales team works with. Stored canonically so the stored value does not depend on the
       * reader's language; the interface translates them.
       */
      collection.enum('stage', {
        values: ['following', 'won', 'lost'],
        nullable: false,
        defaultValue: 'following',
      });
      collection.datetimeTz('createdAt', { nullable: false });
      collection.datetimeTz('updatedAt', { nullable: false });
      collection.index('customerId', {
        name: 'crm_opportunities_customer_idx',
      });
      collection.index('stage', { name: 'crm_opportunities_stage_idx' });
      collection.index('name', { name: 'crm_opportunities_name_idx' });
      collection
        .belongsTo('customer', 'customers', { index: false })
        .targetKey('id')
        .foreignKey('customerId')
        .constraints(true)
        .onDelete('cascade');
    });
  },
  async down({ builder }) {
    // Reverse dependency order: an opportunity and a contact both reference a customer.
    await builder.dropCollection('opportunities');
    await builder.dropCollection('contacts');
    await builder.dropCollection('customers');
  },
});

export default migration;
