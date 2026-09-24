import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * One business table for the service-request acceptance flow.
 *
 * `reference` is a stable business key the seed and tests can identify a row
 * by; `assigneeId` stores the `user.id` string the notification is delivered
 * to. `status` moves from `pending` to `accepted` during acceptance and
 * `result` records the branch the acceptance workflow took.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609240001_create_service_requests',
  async up({ builder }) {
    await builder.createCollection('serviceRequests', (collection) => {
      collection.increments('id');
      collection.string('reference', { length: 32 }).notNull();
      collection.string('title', { length: 200 }).notNull();
      collection.boolean('urgent').notNull().defaultTo(false);
      collection.string('assigneeId', { length: 64 }).notNull();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.string('result', { length: 32 });
      collection.datetime('acceptedAt');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('reference', { mode: 'index' });
      collection.index('assigneeId');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('serviceRequests');
  },
});

export default migration;
