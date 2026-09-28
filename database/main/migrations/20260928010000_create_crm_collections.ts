import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The three CRM tables of the sales application: customers, their contacts, and
 * their opportunities.
 *
 * This migration is immutable history. It spells every field, index and
 * constraint out itself and imports nothing that keeps evolving, so what it
 * applies stays the same regardless of how the Collections are used later.
 */
const migration: MigrationDefinition = defineMigration({
  name: '20260928010000_create_crm_collections',
  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('industry', { length: 255 });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('name');
    });

    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('phone', { length: 64 });
      collection.string('email', { length: 255 });
      // The owning customer is required: a contact with no customer cannot be
      // reached from any customer detail page.
      collection.integer('customerId', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerId');
      collection.foreignKey('customerId', {
        references: { collection: 'customers', fields: ['id'] },
        name: 'fk_contacts_customer_id',
        onDelete: 'cascade',
      });
    });

    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.integer('customerId', { nullable: false });
      // Money is stored as a fixed-point decimal, never a float.
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      // 跟进中 / 赢单 / 输单, stored as the canonical English values the UI
      // translates. The database keeps the value stable, the service rejects
      // anything outside this set.
      collection.enum('stage', {
        values: ['following', 'won', 'lost'],
        nullable: false,
        defaultValue: 'following',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerId');
      collection.index('stage');
      collection.foreignKey('customerId', {
        references: { collection: 'customers', fields: ['id'] },
        name: 'fk_opportunities_customer_id',
        onDelete: 'cascade',
      });
    });
  },
  async down({ builder }) {
    // Reverse creation order: the two child tables reference customers.
    await builder.dropCollection('opportunities');
    await builder.dropCollection('contacts');
    await builder.dropCollection('customers');
  },
});

export default migration;
