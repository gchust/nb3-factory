import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Contacts belong to one customer. `ownerId` mirrors the owning customer's
 * owner so the `recordsIOwn` authorization policy applies uniformly; the
 * sales service keeps it in sync when a customer's owner changes.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609070003_create_sales_contacts',
  async up({ builder }) {
    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255 }).notNull();
      collection.string('phone', { length: 64 }).nullable();
      collection.string('email', { length: 255 }).nullable();
      collection.string('position', { length: 64 }).nullable();
      collection.integer('customerId').notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('customerId', { name: 'idx_contacts_customer' });
      collection.index('ownerId', { name: 'idx_contacts_owner' });
      collection.foreignKey('customerId', {
        name: 'fk_contacts_customer',
        references: { collection: 'customers', fields: ['id'] },
        onDelete: 'restrict',
      });
      collection.foreignKey('ownerId', {
        name: 'fk_contacts_owner',
        references: { collection: 'user', fields: ['id'] },
        onDelete: 'restrict',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('contacts');
  },
} satisfies MigrationDefinition);

export default migration;
