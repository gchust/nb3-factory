import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Opportunities belong to a customer and carry the expected amount. `stage` is
 * stored as one of three stable codes — `in-progress`, `won`, `lost` — so the
 * database value never changes when the UI wording does; labels are supplied by
 * the client locale files. The service rejects any other code and any negative
 * amount. The seed keys on `(customerId, name)` for idempotency, but the pair is
 * deliberately not unique: a repeated name is not a business error here.
 */
const migration: MigrationDefinition = defineMigration({
  name: '20260301000003_create_opportunities',

  async up({ builder }) {
    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 120, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.decimal('amount', {
        precision: 18,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.enum('stage', {
        values: ['in-progress', 'won', 'lost'],
        nullable: false,
        defaultValue: 'in-progress',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('stage');
      collection.foreignKey('customerId', {
        references: { collection: 'customers', fields: ['id'] },
        name: 'fk_opportunities_customer',
        onDelete: 'cascade',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('opportunities');
  },
});

export default migration;
