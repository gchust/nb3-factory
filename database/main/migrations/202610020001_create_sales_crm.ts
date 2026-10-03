import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Customer, contact and opportunity management for a single sales team.
 *
 * The relations are declared as an explicit scalar foreign key plus a
 * `belongsTo` with `foreignKey`/`targetKey`, so the relation lookup helper and
 * a direct `customerId` filter address the same physical column.
 *
 * The `down` order is the reverse of the dependency order: children first.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610020001_create_sales_crm',

  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('industry', { length: 128, nullable: true });
    });

    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('phone', { length: 64, nullable: true });
      collection.string('email', { length: 255, nullable: true });
      collection.integer('customerId', { nullable: false });
      collection.belongsTo('customer', 'customers', {
        foreignKey: 'customerId',
        targetKey: 'id',
        constraints: true,
        onDelete: 'restrict',
      });
    });

    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.belongsTo('customer', 'customers', {
        foreignKey: 'customerId',
        targetKey: 'id',
        constraints: true,
        onDelete: 'restrict',
      });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.enum('stage', {
        values: ['follow_up', 'won', 'lost'],
        nullable: false,
        defaultValue: 'follow_up',
      });
      collection.index('stage');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('opportunities');
    await builder.dropCollection('contacts');
    await builder.dropCollection('customers');
  },
});

export default migration;
