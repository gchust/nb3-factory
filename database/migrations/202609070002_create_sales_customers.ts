import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Customers and their one-to-one customer profiles.
 *
 * `customers.ownerId` is the record owner used by the authorization
 * `recordsIOwn` policy. `isPublic` marks a customer visible in the public
 * directory that the visitor role reads.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609070002_create_sales_customers',
  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('customerNo', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('industry', { length: 64 }).nullable();
      collection.string('size', { length: 32 }).nullable();
      collection.string('status', { length: 32 }).notNull().defaultTo('active');
      collection.string('phone', { length: 64 }).nullable();
      collection.boolean('isPublic').notNull().defaultTo(false);
      collection.string('ownerId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('customerNo', { name: 'uq_customers_customer_no' });
      collection.index('ownerId', { name: 'idx_customers_owner' });
      collection.index('isPublic', { name: 'idx_customers_public' });
      collection.foreignKey('ownerId', {
        name: 'fk_customers_owner',
        references: { collection: 'user', fields: ['id'] },
        onDelete: 'restrict',
      });
    });

    await builder.createCollection('customerProfiles', (collection) => {
      collection.increments('id');
      collection.integer('customerId').notNull();
      collection.string('address', { length: 255 }).nullable();
      collection.string('creditLevel', { length: 32 }).nullable();
      collection.text('notes').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('customerId', {
        name: 'uq_customer_profiles_customer',
      });
      collection.foreignKey('customerId', {
        name: 'fk_customer_profiles_customer',
        references: { collection: 'customers', fields: ['id'] },
        onDelete: 'cascade',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('customerProfiles');
    await builder.dropCollection('customers');
  },
} satisfies MigrationDefinition);

export default migration;
