import { defineMigration } from '@nocobase/db';

/**
 * Creates the table an employee's IT repair request is stored in.
 *
 * The shape is spelled out here rather than derived from a live declaration, so
 * a later change to the feature cannot change what this migration did.
 *
 * `submitterId` and `assigneeId` are plain columns, not foreign keys. The
 * submitter and the handler are read and displayed through the user table, but
 * neither relation is traversed by an authorization scope, and a plain string
 * keeps deletion of a user account from cascading into repair history.
 */
const migration = defineMigration({
  name: '202609240001_create_it_tickets',
  async up({ builder }) {
    await builder.createCollection('itTickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      // One of `computer`, `account` or `other`. The set is enforced on input by
      // the server, not by a database constraint, so adding a category later is
      // a normal feature change rather than a schema change.
      collection.string('category', { length: 32 }).notNull();
      collection.text('description').notNull();
      // One of `pending`, `processing` or `completed`.
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.string('submitterId', { length: 64 }).notNull();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection.text('resolution').nullable();
      collection.datetime('startedAt').nullable();
      collection.datetime('completedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('submitterId', { name: 'idx_it_tickets_submitter' });
      collection.index('assigneeId', { name: 'idx_it_tickets_assignee' });
      collection.index('status', { name: 'idx_it_tickets_status' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('itTickets');
  },
});

export default migration;
