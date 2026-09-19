import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Sales customers — the root of the sales domain.
 *
 * `ownerId` is the salesperson responsible for the customer. Row-level access
 * is derived from it: a salesperson reads only rows whose owner is themselves,
 * while a manager (system-administrator) reads every row. `avatarFileId`
 * references a row in `sales_files` and is nullable so a customer starts
 * without a logo.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190001_create_sales_customers',

  async up({ builder }) {
    await builder.createCollection('salesCustomers', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('industry', { length: 64 }).nullable();
      collection.string('source', { length: 64 }).nullable();
      // Importance: high | normal | low
      collection
        .string('importance', { length: 16 })
        .notNull()
        .defaultTo('normal');
      // Status: potential | following | signed | lost
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('potential');
      collection.string('ownerId', { length: 64 }).nullable();
      collection.string('phone', { length: 64 }).nullable();
      collection.string('email', { length: 255 }).nullable();
      collection.text('notes').nullable();
      collection.string('avatarFileId', { length: 64 }).nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('ownerId');
      collection.index('status');
      collection.index('name');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('salesCustomers');
  },
});

export default migration;
