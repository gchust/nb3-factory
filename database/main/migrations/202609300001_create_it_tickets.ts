import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The IT repair ticket table. Self-contained on purpose: a migration is
 * immutable history, so it spells out every field, index and constraint
 * rather than importing a definition that keeps evolving.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609300001_create_it_tickets',
  async up({ builder }) {
    await builder.createCollection('itTickets', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.string('category', { length: 32 }).notNull();
      collection.text('description').notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('handlerId', { length: 64 }).nullable();
      collection.text('resolution').nullable();
      collection.datetime('startedAt').nullable();
      collection.datetime('completedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_it_tickets' });
      collection.index(['ownerId', 'status'], {
        name: 'idx_it_tickets_owner_status',
      });
      collection.index('status', { name: 'idx_it_tickets_status' });
      collection.index('handlerId', { name: 'idx_it_tickets_handler' });
      collection.index('createdAt', { name: 'idx_it_tickets_created_at' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('itTickets');
  },
});

export default migration;
