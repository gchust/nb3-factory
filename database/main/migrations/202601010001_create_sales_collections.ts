import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The sales management schema: customers, their contacts, and their opportunities.
 *
 * Self-contained by design: every field, index and constraint is spelled out here rather than imported from a
 * Collection definition, so a later change to how the application describes these tables cannot change what this
 * migration already applied.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202601010001_create_sales_collections',

  async up({ builder }) {
    // A customer is the account a contact belongs to and an opportunity is sold to.
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.string('industry', { length: 128, nullable: true });
      // Unique so a customer can be upserted by name and duplicate accounts are rejected.
      collection.unique('name');
    });

    // A contact is one person, always attached to exactly one customer.
    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.string('contactInfo', { length: 256, nullable: true });
      collection.integer('customerId', { nullable: false });
      collection.foreignKey('customerId', {
        references: { collection: 'customers', fields: ['id'] },
        name: 'fk_contacts_customer',
        onDelete: 'cascade',
      });
      collection.index('customerId');
    });

    // An opportunity is a deal for one customer, tracked through its stage.
    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: true });
      collection.integer('customerId', { nullable: false });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: true,
      });
      collection.enum('stage', {
        values: ['following', 'won', 'lost'],
        nullable: false,
        defaultValue: 'following',
      });
      collection.foreignKey('customerId', {
        references: { collection: 'customers', fields: ['id'] },
        name: 'fk_opportunities_customer',
        onDelete: 'cascade',
      });
      collection.index('customerId');
      collection.index('stage');
    });
  },

  async down({ builder }) {
    // Children first: dropping a customer before its dependents would break the foreign keys.
    await builder.dropCollection('opportunities');
    await builder.dropCollection('contacts');
    await builder.dropCollection('customers');
  },
});

export default migration;
