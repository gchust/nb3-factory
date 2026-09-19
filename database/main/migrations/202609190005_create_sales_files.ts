import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Sales files.
 *
 * The nine leading columns are the contract `@nocobase/app-plugin-file`
 * requires of a file collection: upload composes exactly these values. The
 * business columns after them are nullable on purpose — the plugin's upload
 * path supplies no caller values, so the application links a freshly stored
 * object to its customer/opportunity/follow-up in a second, permission-checked
 * step. Files with no association yet are private to the uploader.
 *
 * One collection carries every kind of sales file, separated by `category`
 * (avatar | opportunity | followup), so follow-up photos can never be listed
 * under an opportunity and vice versa.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190005_create_sales_files',

  async up({ builder }) {
    await builder.createCollection('salesFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.string('customerId', { length: 64 }).nullable();
      collection.string('opportunityId', { length: 64 }).nullable();
      collection.string('followUpId', { length: 64 }).nullable();
      collection.string('category', { length: 32 }).nullable();
      collection.string('uploadedById', { length: 64 }).nullable();
      collection.string('uploadedByName', { length: 255 }).nullable();

      collection.index('customerId');
      collection.index('opportunityId');
      collection.index('followUpId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('salesFiles');
  },
});

export default migration;
