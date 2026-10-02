import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The CRM tables: customers, their contacts, and their opportunities.
 *
 * The stage is stored as one of the canonical codes `following`, `won` and `lost`; the Chinese and English labels are
 * translated in the client. Amounts keep two decimal places and a database default of 0.
 *
 * Every relation declares its scalar foreign key column and the relation explicitly. The builder does not infer a
 * column, so a `belongsTo` without both `foreignKey` and `targetKey` is rejected while the migration compiles.
 */
const migration: MigrationDefinition = defineMigration({
  name: '20261001120000_create_crm_collections',
  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.string('industry', { length: 128 });
    });

    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      // Free-form contact information: phone, email, or an instant-messaging handle.
      collection.string('contact', { length: 255 });
      collection.integer('customerId', { nullable: false });
      collection.belongsTo('customer', 'customers', {
        foreignKey: 'customerId',
        targetKey: 'id',
        constraints: true,
        onDelete: 'cascade',
      });
    });

    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.belongsTo('customer', 'customers', {
        foreignKey: 'customerId',
        targetKey: 'id',
        constraints: true,
        onDelete: 'cascade',
      });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.enum('stage', {
        values: ['following', 'won', 'lost'],
        nullable: false,
        defaultValue: 'following',
      });
      collection.index('stage');
    });
  },
  async down({ builder }) {
    // Reverse dependency order: contacts and opportunities reference customers.
    await builder.dropCollection('opportunities');
    await builder.dropCollection('contacts');
    await builder.dropCollection('customers');
  },
});

export default migration;
