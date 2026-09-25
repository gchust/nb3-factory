import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Simplified CRM schema: Customers, Contacts and Opportunities.
 *
 * The three tables are application-owned (`crm_` prefix) and self-contained:
 * every field, foreign key and index is spelled out here rather than imported
 * from a Collection definition that keeps evolving.
 */
const migration: MigrationDefinition = defineMigration({
  name: '20260210120000_create_crm',

  async up({ builder }) {
    await builder.createCollection('crm_customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 120, nullable: false });
      collection.string('industry', { length: 120, nullable: true });
      collection.index('name');
    });

    await builder.createCollection('crm_contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 120, nullable: false });
      collection.string('contactInfo', { length: 200, nullable: true });
      // The scalar foreign key is declared explicitly. The relation carries the
      // join metadata the Repository reads; the constraint below it is what
      // actually emits the cascade the relation option describes.
      collection.integer('customerId', { nullable: false });
      collection.foreignKey('customerId', {
        references: { collection: 'crm_customers', fields: ['id'] },
        name: 'fk_crm_contacts_customer',
        onDelete: 'cascade',
      });
      collection.belongsTo('customer', 'crm_customers', {
        foreignKey: 'customerId',
        targetKey: 'id',
        nullable: false,
        onDelete: 'cascade',
      });
      collection.index('customerId');
    });

    await builder.createCollection('crm_opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 160, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.foreignKey('customerId', {
        references: { collection: 'crm_customers', fields: ['id'] },
        name: 'fk_crm_opportunities_customer',
        onDelete: 'cascade',
      });
      collection.belongsTo('customer', 'crm_customers', {
        foreignKey: 'customerId',
        targetKey: 'id',
        nullable: false,
        onDelete: 'cascade',
      });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.string('stage', {
        length: 32,
        nullable: false,
        defaultValue: 'following',
      });
      collection.index('customerId');
      collection.index('stage');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('crm_opportunities');
    await builder.dropCollection('crm_contacts');
    await builder.dropCollection('crm_customers');
  },
});

export default migration;
