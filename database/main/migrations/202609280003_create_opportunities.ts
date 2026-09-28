import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Opportunities belong to a customer and carry the expected amount and the
 * three-stage lifecycle the sales team works with: following, won, lost.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609280003_create_opportunities',

  async up({ builder }) {
    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.enum('stage', {
        values: ['following', 'won', 'lost'],
        nullable: false,
        defaultValue: 'following',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('customerId', {
        references: { collection: 'customers', fields: ['id'] },
        name: 'fk_opportunities_customer',
        onDelete: 'cascade',
      });
      collection.index('customerId');
      collection.index('stage');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('opportunities');
  },
});

export default migration;
