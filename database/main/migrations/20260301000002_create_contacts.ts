import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Contacts belong to a customer, and the foreign key makes an orphaned contact
 * impossible at the schema level. The seed keys on `(customerId, name)` to stay
 * idempotent without inventing a synthetic key, but the pair is not unique:
 * the business did not ask for it, and it would make two namesakes an error.
 */
const migration: MigrationDefinition = defineMigration({
  name: '20260301000002_create_contacts',

  async up({ builder }) {
    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 120, nullable: false });
      collection.string('contactInfo', { length: 200, nullable: true });
      collection.integer('customerId', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('customerId', {
        references: { collection: 'customers', fields: ['id'] },
        name: 'fk_contacts_customer',
        onDelete: 'cascade',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('contacts');
  },
});

export default migration;
