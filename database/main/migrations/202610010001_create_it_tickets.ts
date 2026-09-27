import { defineMigration } from '@nocobase/db';

/**
 * IT repair tickets.
 *
 * Schema history only: every field, index and constraint is spelled out here
 * and must not import a live Collection declaration. The table deliberately
 * carries no relation to the authentication plugin's `user` collection: an
 * application migration runs in every runtime, including one composed without
 * that plugin, and a relation whose target is absent fails relation
 * validation. `202610010002_add_it_ticket_people` adds the two people
 * relations once `user` exists.
 *
 * The submission category is stored as a plain string and validated in the
 * business service, so a new category never needs a schema change.
 */
export default defineMigration({
  name: '202610010001_create_it_tickets',
  async up({ builder }) {
    await builder.createCollection('itTickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200, nullable: false });
      collection.string('category', { length: 32, nullable: false });
      collection.text('description');
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'pending',
      });
      collection.text('resolution');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.datetime('startedAt');
      collection.datetime('completedAt');
      collection.index('status', { name: 'idx_it_tickets_status' });
      collection.index('createdAt', { name: 'idx_it_tickets_created_at' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('itTickets');
  },
});
