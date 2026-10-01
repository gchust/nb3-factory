import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The three CRM records this application owns: customers, the contacts that
 * belong to a customer, and the opportunities that belong to a customer.
 *
 * A foreign key is a data-integrity rule, not a permission check: deleting a
 * customer is not an operation this application offers, so `cascade` is only
 * the safe default if a future one is added.
 */
const migration: MigrationDefinition = defineMigration({
  name: '20260928000001_create_crm_collections',
  async up({ builder }) {
    await builder.createCollection('crmCustomers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('industry', { length: 255, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index(['name'], { name: 'idx_crm_customers_name' });
    });

    await builder.createCollection('crmContacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('phone', { length: 64, nullable: true });
      collection.string('email', { length: 255, nullable: true });
      collection.integer('customerId', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('customerId', {
        name: 'fk_crm_contacts_customer',
        references: { collection: 'crmCustomers', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.index(['customerId'], {
        name: 'idx_crm_contacts_customer',
      });
    });

    await builder.createCollection('crmOpportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.enum('stage', {
        values: ['nurturing', 'won', 'lost'],
        nullable: false,
        defaultValue: 'nurturing',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('customerId', {
        name: 'fk_crm_opportunities_customer',
        references: { collection: 'crmCustomers', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.index(['customerId'], {
        name: 'idx_crm_opportunities_customer',
      });
      collection.index(['stage'], { name: 'idx_crm_opportunities_stage' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('crmOpportunities');
    await builder.dropCollection('crmContacts');
    await builder.dropCollection('crmCustomers');
  },
});

export default migration;
