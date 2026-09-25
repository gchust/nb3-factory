import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the three tables of the simple CRM feature: customers, contacts and
 * opportunities. Contacts and opportunities both belong to one customer.
 *
 * The migration is immutable history, so every field, index and constraint is
 * spelled out here rather than imported from a Collection definition that keeps
 * evolving. `createdAt` is declared explicitly because a table has no automatic
 * timestamps and data writes always supply it.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609100001_create_crm_tables',
  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 120, nullable: false, unique: true });
      collection.string('industry', { length: 120, nullable: true });
      collection.datetime('createdAt', { nullable: false });
    });

    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 120, nullable: false });
      collection.string('contactInfo', { length: 200, nullable: true });
      collection.belongsTo('customer', 'customers', {
        foreignKey: 'customerId',
        foreignKeyType: 'integer',
        targetKey: 'id',
        nullable: false,
        onDelete: 'cascade',
      });
      collection.datetime('createdAt', { nullable: false });
      // A customer's contacts are addressed by name, so one customer cannot have
      // two contacts with the same name. The same key backs idempotent seeds.
      collection.unique(['customerId', 'name']);
    });

    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 160, nullable: false });
      collection.belongsTo('customer', 'customers', {
        foreignKey: 'customerId',
        foreignKeyType: 'integer',
        targetKey: 'id',
        nullable: false,
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
      collection.datetime('createdAt', { nullable: false });
      collection.unique(['customerId', 'name']);
      collection.index(['stage']);
    });
  },
  async down({ builder }) {
    await builder.dropCollection('opportunities');
    await builder.dropCollection('contacts');
    await builder.dropCollection('customers');
  },
});

export default migration;
