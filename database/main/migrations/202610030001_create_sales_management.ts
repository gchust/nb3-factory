import { defineMigration } from '@nocobase/db';

// Sales management: customers, their contacts, and their opportunities. Self-contained on purpose — the collections
// this migration creates are described here and nowhere else, so correcting the file later cannot silently change
// what an already-applied migration means.
const migration = defineMigration({
  name: '202610030001_create_sales_management',

  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('industry', { length: 255 });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('name', { name: 'customers_name_idx' });
    });

    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      // Contact information is optional: a name alone is a usable contact.
      collection.string('phone', { length: 64 });
      collection.string('email', { length: 320 });
      collection.integer('customerId', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      // The owning customer is required, so deleting one would orphan its contacts; the constraint rejects it and
      // the service reports a business error instead.
      collection
        .belongsTo('customer', 'customers', { index: false })
        .foreignKey('customerId')
        .targetKey('id')
        .constraints(true)
        .onDelete('restrict');
      collection.index('customerId', { name: 'contacts_customer_idx' });
      collection.index('name', { name: 'contacts_name_idx' });
    });

    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      // The only stages a sales team moves an opportunity through.
      collection.enum('stage', {
        values: ['following_up', 'won', 'lost'],
        nullable: false,
        defaultValue: 'following_up',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection
        .belongsTo('customer', 'customers', { index: false })
        .foreignKey('customerId')
        .targetKey('id')
        .constraints(true)
        .onDelete('restrict');
      collection.index('customerId', { name: 'opportunities_customer_idx' });
      collection.index('stage', { name: 'opportunities_stage_idx' });
    });
  },

  async down({ builder }) {
    // Reverse dependency order: the tables that point at customers go first.
    await builder.dropCollection('opportunities');
    await builder.dropCollection('contacts');
    await builder.dropCollection('customers');
  },
});

export default migration;
