import { defineMigration } from '@nocobase/db';

/**
 * IT repair tickets (Issue #505).
 *
 * `submittedById` / `handlerId` hold `user.id` values (a 64-character UUID). No
 * foreign key is declared: the ticket table must survive a user row being
 * removed, and the authentication tables are owned by another migration whose
 * ordering this one should not depend on. The display names are denormalized so
 * a reporter can read their own ticket without being granted access to the
 * `user` collection.
 */
const migration = defineMigration({
  name: '202609300001_create_repair_tickets',
  async up({ builder }) {
    await builder.createCollection('repairTickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      // One of `computer`, `account`, `other`. Stored as a string rather than a
      // database enum so the allowed values can be enforced and translated in
      // the application layer without a schema change.
      collection.string('category', { length: 32 }).notNull();
      collection.text('description').nullable();
      // One of `pending`, `processing`, `completed`.
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.text('resolution').nullable();
      collection.string('submittedById', { length: 64 }).notNull();
      collection.string('submittedByName', { length: 255 }).notNull();
      collection.string('handlerId', { length: 64 }).nullable();
      collection.string('handlerName', { length: 255 }).nullable();
      collection.datetime('processingAt').nullable();
      collection.datetime('completedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('submittedById', {
        name: 'idx_repair_tickets_submitted_by',
      });
      collection.index('status', { name: 'idx_repair_tickets_status' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('repairTickets');
  },
});

export default migration;
