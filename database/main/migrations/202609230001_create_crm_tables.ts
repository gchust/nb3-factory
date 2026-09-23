import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The CRM's three entities: customers, their contacts, and their opportunities.
 *
 * The structure is spelled out here rather than imported, because a migration is immutable
 * history: an imported definition would keep evolving while the migration is supposed to mean
 * what it meant when it ran. Contact and opportunity rows point at a customer and are removed
 * with it, so no orphan rows survive a customer deletion.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609230001_create_crm_tables',

  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('industry', { length: 255, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });

    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('contactInfo', { length: 255, nullable: true });
      collection
        .belongsTo('customer', 'customers')
        .targetKey('id')
        .foreignKey('customerId')
        .foreignKeyType('integer')
        .notNull()
        .constraints(true)
        .onDelete('cascade');
      collection.index('customerId');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });

    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection
        .belongsTo('customer', 'customers')
        .targetKey('id')
        .foreignKey('customerId')
        .foreignKeyType('integer')
        .notNull()
        .constraints(true)
        .onDelete('cascade');
      collection.index('customerId');
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
      collection.index('stage');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('opportunities');
    await builder.dropCollection('contacts');
    await builder.dropCollection('customers');
  },
});

export default migration;
