import { defineMigration } from '@nocobase/db';

/**
 * IT repair tickets (员工 IT 报修单).
 *
 * One row is one employee-reported issue. `submitterId` and `handlerId` store
 * the Better Auth `user.id` values; `status` drives the only workflow the
 * business allows: pending → in_progress → completed. Timestamps are written by
 * the server on each transition, not by the database, so the migration declares
 * them explicitly (`createdAt`/`updatedAt` are never nullable).
 */
export default defineMigration({
  name: '202609200001_create_it_tickets',
  async up({ builder }) {
    await builder.createCollection('itTickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection
        .enum('category', { values: ['computer', 'account', 'other'] })
        .notNull();
      collection.text('description').nullable();
      collection
        .enum('status', { values: ['pending', 'in_progress', 'completed'] })
        .notNull()
        .defaultTo('pending');
      collection.text('resolution').nullable();
      collection.string('submitterId', { length: 64 }).notNull();
      collection.string('handlerId', { length: 64 }).nullable();
      collection.datetime('startedAt').nullable();
      collection.datetime('completedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('submitterId', { name: 'idx_it_tickets_submitter' });
      collection.index('handlerId', { name: 'idx_it_tickets_handler' });
      collection.index('status', { name: 'idx_it_tickets_status' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('itTickets');
  },
});
