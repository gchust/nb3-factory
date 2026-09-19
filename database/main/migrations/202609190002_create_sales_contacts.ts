import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Contacts belong to a customer. `customerId` is the ownership anchor used to
 * decide whether a salesperson may read or change the contact.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190002_create_sales_contacts',

  async up({ builder }) {
    await builder.createCollection('salesContacts', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('customerId', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('title', { length: 128 }).nullable();
      collection.string('phone', { length: 64 }).nullable();
      collection.string('email', { length: 255 }).nullable();
      collection.boolean('isPrimary').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('customerId');
      collection.index('name');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('salesContacts');
  },
});

export default migration;
