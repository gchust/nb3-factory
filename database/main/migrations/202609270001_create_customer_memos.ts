import { defineMigration } from '@nocobase/db';

/**
 * The single business table of the app: one memo per customer name plus an
 * optional note and the moment it was recorded.
 *
 * Self-contained on purpose. The migration spells out every column, index and
 * nullability so an already-applied run keeps meaning the same thing after the
 * application evolves around it.
 */
export default defineMigration({
  name: '202609270001_create_customer_memos',
  async up({ builder }) {
    await builder.createCollection('customerMemos', (collection) => {
      collection.increments('id');
      collection.string('customerName', { length: 200, nullable: false });
      collection.text('note', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.index('customerName');
      collection.index('createdAt');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('customerMemos', { ifExists: true });
  },
});
