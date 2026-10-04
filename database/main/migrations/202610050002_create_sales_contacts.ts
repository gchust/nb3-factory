import { defineMigration } from '@nocobase/db';

/**
 * People who work at a Customer.
 *
 * A contact must belong to exactly one customer, so `customerId` is not null
 * and carries a foreign key that cascades with the customer. The index backs
 * the customer detail query (all contacts of one customer).
 */
const migration = defineMigration({
  name: '202610050002_create_sales_contacts',
  async up({ builder }) {
    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128 }).notNull();
      collection.string('phone', { length: 32 }).nullable();
      collection.string('email', { length: 128 }).nullable();
      collection.integer('customerId').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('customerId', { name: 'idx_sales_contacts_customer' });
      collection.foreignKey('customerId', {
        name: 'fk_sales_contacts_customer',
        references: { collection: 'customers', fields: ['id'] },
        onDelete: 'cascade',
        onUpdate: 'cascade',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('contacts');
  },
});

export default migration;
