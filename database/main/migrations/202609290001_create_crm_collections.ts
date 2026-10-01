import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the CRM tables behind Issue #504: customers, contacts and opportunities.
 *
 * The migration spells out every field, index and constraint itself. It must stay
 * self-contained and immutable once merged, so it never imports a collection
 * definition or a shared constant that keeps evolving.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609290001_create_crm_collections',

  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 100, nullable: false });
      collection.string('industry', { length: 100, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('name');
    });

    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 100, nullable: false });
      collection.string('phone', { length: 50, nullable: true });
      collection.string('email', { length: 100, nullable: true });
      collection.integer('customerId', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerId');
      collection.index('name');
      collection.foreignKey('customerId', {
        references: { collection: 'customers', fields: ['id'] },
        name: 'fk_contacts_customer',
      });
    });

    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 120, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      // Stored as a stable code (`follow_up` | `won` | `lost`) and validated by the
      // service layer, so the allowed set stays locale-independent.
      collection.string('stage', { length: 20, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerId');
      collection.index('stage');
      collection.index('name');
      collection.foreignKey('customerId', {
        references: { collection: 'customers', fields: ['id'] },
        name: 'fk_opportunities_customer',
      });
    });
  },

  async down({ builder }) {
    // Reverse order: the two child tables reference customers.
    await builder.dropCollection('opportunities');
    await builder.dropCollection('contacts');
    await builder.dropCollection('customers');
  },
});

export default migration;
