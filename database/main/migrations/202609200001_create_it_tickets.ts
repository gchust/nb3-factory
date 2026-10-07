import { defineMigration } from '@nocobase/db';

/**
 * The single business table of the IT repair ticketing feature.
 *
 * Every column is spelled out here rather than derived from a shared
 * Collection definition, so a later change to the feature cannot silently
 * change what this migration already did to an installed database.
 *
 * `submitterId` / `handlerId` are plain columns, not relations: the feature
 * only ever needs the id and the display name captured at the time of the
 * action, and keeping them off the relation graph avoids exposing the user
 * table through this feature.
 */
const migration = defineMigration({
  name: '202609200001_create_it_tickets',
  async up({ builder }) {
    await builder.createCollection('itTickets', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.string('category', { length: 32 }).notNull();
      collection.text('description').nullable();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.text('resolutionNote').nullable();
      collection.string('submitterId', { length: 64 }).notNull();
      collection.string('submitterName', { length: 255 }).notNull();
      collection.string('handlerId', { length: 64 }).nullable();
      collection.string('handlerName', { length: 255 }).nullable();
      collection.datetime('startedAt').nullable();
      collection.datetime('completedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_it_tickets' });
      collection.index('submitterId', {
        name: 'idx_it_tickets_submitter',
      });
      collection.index('status', { name: 'idx_it_tickets_status' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('itTickets');
  },
});

export default migration;
