import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Contacts belong to a customer. Deleting a customer removes its contacts,
 * which is the behaviour the sales team expects when a customer is removed.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609280002_create_contacts',

  async up({ builder }) {
    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.string('phone', { length: 64, nullable: true });
      collection.string('email', { length: 255, nullable: true });
      collection.integer('customerId', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('customerId', {
        references: { collection: 'customers', fields: ['id'] },
        name: 'fk_contacts_customer',
        onDelete: 'cascade',
      });
      collection.index('customerId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('contacts');
  },
});

export default migration;
