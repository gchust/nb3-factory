import { defineMigration } from '@nocobase/db';

// The application's one business table: an internal customer memo. It keeps only
// what the feature needs — a required customer name, optional notes and the
// creation time. `updatedAt` is kept so the list can show when an edit happened.
const migration = defineMigration({
  name: '202608270001_create_customer_memos',
  async up({ builder }) {
    await builder.createCollection('customerMemos', (collection) => {
      collection.string('id', { length: 36 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.text('notes').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_customer_memos' });
      // The list is ordered by creation time, so the sort has an index to use.
      collection.index('createdAt', {
        name: 'idx_customer_memos_created_at',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('customerMemos');
  },
});

export default migration;
