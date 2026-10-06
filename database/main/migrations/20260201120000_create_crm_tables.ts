import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Customer, contact and opportunity tables for the sales team.
 *
 * Self-contained by design: every column, index and constraint is spelled out
 * here instead of importing a Collection definition that keeps evolving, so an
 * already-applied migration always means the same thing.
 *
 * `customers.name`, `contacts.name+customerId` and `opportunities.name+customerId`
 * carry unique constraints so the sample-data seed can rely on `upsertOne`
 * idempotency against a stable business key.
 *
 * There is deliberately no CHECK constraint on `opportunities.amount`: the
 * knex schema adapter skips check constraints, so "amount is never negative" is
 * enforced by the service layer and the form.
 */
const migration: MigrationDefinition = defineMigration({
  name: '20260201120000_create_crm_tables',
  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.string('industry', { length: 128 });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('name', { name: 'crm_customers_name_unique' });
      collection.index('industry', { name: 'crm_customers_industry_idx' });
    });

    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.string('phone', { length: 64 });
      collection.string('email', { length: 256 });
      collection.integer('customerId', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['customerId', 'name'], {
        name: 'crm_contacts_customer_name_unique',
      });
      collection.index('customerId', { name: 'crm_contacts_customer_idx' });
      collection.foreignKey('customerId', {
        name: 'crm_contacts_customer_fk',
        references: { collection: 'customers', fields: ['id'] },
        onDelete: 'cascade',
      });
    });

    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
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
      collection.unique(['customerId', 'name'], {
        name: 'crm_opportunities_customer_name_unique',
      });
      collection.index('customerId', {
        name: 'crm_opportunities_customer_idx',
      });
      collection.index('stage', { name: 'crm_opportunities_stage_idx' });
      collection.foreignKey('customerId', {
        name: 'crm_opportunities_customer_fk',
        references: { collection: 'customers', fields: ['id'] },
        onDelete: 'cascade',
      });
    });
  },
  async down({ builder }) {
    // Reverse dependency order: children before the customer they reference.
    await builder.dropCollection('opportunities');
    await builder.dropCollection('contacts');
    await builder.dropCollection('customers');
  },
});

export default migration;
