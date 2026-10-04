import { defineMigration } from '@nocobase/db';

/**
 * Deals being worked on for a Customer.
 *
 * `stage` holds a stable code, one of `following`, `won`, `lost`; the interface
 * translates it. `amount` is a non-negative expected value, stored with two
 * decimal places. Non-negativity is enforced on the way in (the API rejects a
 * negative amount) rather than by a database check, so the same rule holds on
 * every dialect.
 *
 * Both the customer detail query and the stage filter are indexed.
 */
const migration = defineMigration({
  name: '202610050003_create_sales_opportunities',
  async up({ builder }) {
    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128 }).notNull();
      collection.integer('customerId').notNull();
      collection
        .decimal('amount', { precision: 14, scale: 2 })
        .notNull()
        .defaultTo(0);
      collection.string('stage', { length: 32 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('customerId', {
        name: 'idx_sales_opportunities_customer',
      });
      collection.index('stage', { name: 'idx_sales_opportunities_stage' });
      collection.foreignKey('customerId', {
        name: 'fk_sales_opportunities_customer',
        references: { collection: 'customers', fields: ['id'] },
        onDelete: 'cascade',
        onUpdate: 'cascade',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('opportunities');
  },
});

export default migration;
