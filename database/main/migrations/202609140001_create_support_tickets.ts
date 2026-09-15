import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609140001_create_support_tickets',

  async up({ builder }) {
    await builder.createCollection('support_tickets', (collection) => {
      collection.increments('id');
      collection.string('number', { length: 32 }).notNull();
      collection.string('customerId', { length: 255 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('description').nullable();
      collection.string('priority', { length: 16 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.string('assigneeId', { length: 255 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('number', { name: 'uq_support_tickets_number' });
      collection.index('customerId', { name: 'idx_support_tickets_customer' });
      collection.index('status', { name: 'idx_support_tickets_status' });
      collection.index('priority', { name: 'idx_support_tickets_priority' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('support_tickets');
  },
});

export default migration;
