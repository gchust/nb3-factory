import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Field service follow-up records.
 *
 * Self-contained on purpose: the migration must keep meaning the same thing after it has been applied, so it declares
 * its own fields, lengths, nullability and indexes rather than importing a collection definition that keeps evolving.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609220001_create_field_visits',

  async up({ builder }) {
    await builder.createCollection('fieldVisits', (collection) => {
      collection.increments('id');
      collection.string('customerName', { length: 64, nullable: false });
      collection.date('visitDate', { nullable: false });
      collection.string('conclusion', { length: 32, nullable: false });
      collection.string('engineerName', { length: 64, nullable: true });
      collection.text('notes', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerName');
      collection.index('visitDate');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('fieldVisits');
  },
});

export default migration;
