import { defineMigration } from '@nocobase/db';

/**
 * The IT support ticket table.
 *
 * `submitterId` and `handlerId` hold `user.id`, which is a UUID string, so they
 * are strings rather than integers and carry no foreign key: the user table is
 * owned by the authentication plugin, and this application only references
 * identities through the public session and authorization services.
 */
export default defineMigration({
  name: '202609290001_create_tickets',
  async up({ builder }) {
    await builder.createCollection('tickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200 }).notNull();
      collection.string('category', { length: 32 }).notNull();
      collection.text('description').nullable();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.text('resolution').nullable();
      collection.string('submitterId', { length: 255 }).notNull();
      collection.string('handlerId', { length: 255 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.datetime('handledAt').nullable();
      collection.index('status', { name: 'idx_tickets_status' });
      collection.index('submitterId', { name: 'idx_tickets_submitter' });
      collection.index('handlerId', { name: 'idx_tickets_handler' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('tickets');
  },
});
