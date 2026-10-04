import { defineMigration } from '@nocobase/db';

/**
 * The tickets a colleague files when something in IT needs fixing.
 *
 * `submitterId` and `handlerId` are plain identifiers rather than foreign keys:
 * the ticket keeps the display names it recorded when the work happened, so a
 * reader never has to resolve the `user` collection (which employees cannot
 * read) and a later account change cannot rewrite history. This migration is
 * self-contained — it names every field and constraint instead of importing a
 * definition that keeps evolving.
 */
export default defineMigration({
  name: '202610050001_create_tickets',
  async up({ builder }) {
    await builder.createCollection('tickets', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('reference', { length: 32 }).notNull();
      collection.string('title', { length: 200 }).notNull();
      // One of the three canonical categories; the client translates and the
      // route validates against the same closed set.
      collection.string('category', { length: 32 }).notNull();
      collection.text('description').nullable();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.string('submitterId', { length: 64 }).notNull();
      collection.string('submitterName', { length: 255 }).notNull();
      collection.string('handlerId', { length: 64 }).nullable();
      collection.string('handlerName', { length: 255 }).nullable();
      collection.text('resolution').nullable();
      collection.datetime('completedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_tickets' });
      collection.unique('reference', { name: 'uq_tickets_reference' });
      collection.index('status', { name: 'idx_tickets_status' });
      collection.index('submitterId', { name: 'idx_tickets_submitter' });
      collection.index('handlerId', { name: 'idx_tickets_handler' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('tickets');
  },
});
