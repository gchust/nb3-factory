import { defineMigration } from '@nocobase/db';

/**
 * The single business table for the simplified service-request flow.
 *
 * `assigneeId` stores a `user.id` (a string in the authentication schema). The
 * field deliberately carries no relation: the acceptance workflow reads and
 * writes by identity, and the demo does not need relation traversal.
 */
export default defineMigration({
  name: '202609250001_create_service_requests',
  async up({ builder }) {
    await builder.createCollection('serviceRequests', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 256 }).notNull();
      collection.boolean('urgent').notNull().defaultTo(false);
      collection.string('assigneeId', { length: 64 }).notNull();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      // `normal` or `urgent` once the acceptance workflow has run; null while
      // the request is still pending.
      collection.string('result', { length: 32 }).nullable();
      collection.datetime('acceptedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.index('status', { name: 'idx_service_requests_status' });
      collection.index('assigneeId', { name: 'idx_service_requests_assignee' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('serviceRequests');
  },
});
