import { defineMigration } from '@nocobase/db';

/**
 * IT repair tickets (员工 IT 报修工单).
 *
 * The submitter and the handler are stored as plain string identifiers with a
 * name snapshot taken at the moment they acted, rather than as relations to
 * the authentication `user` collection. A ticket is a historical record: the
 * name shown beside it must stay what it was when the ticket was submitted or
 * handled, even if the account is renamed or removed later.
 *
 * `status` moves `pending` → `processing` → `completed` and never back; the
 * server routes enforce that transition in the update filter. `createdAt` and
 * `updatedAt` are written by the application because the repository does not
 * manage timestamps on its own.
 */
const migration = defineMigration({
  name: '202609280001_create_it_tickets',
  async up({ builder }) {
    await builder.createCollection('itTickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.string('category', { length: 32 }).notNull();
      collection.text('description').nullable();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.string('submitterId', { length: 64 }).notNull();
      collection.string('submitterName', { length: 255 }).nullable();
      collection.string('handlerId', { length: 64 }).nullable();
      collection.string('handlerName', { length: 255 }).nullable();
      collection.text('resolution').nullable();
      collection.datetime('startedAt').nullable();
      collection.datetime('completedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.index('status');
      collection.index('submitterId');
      collection.index('handlerId');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('itTickets');
  },
});

export default migration;
