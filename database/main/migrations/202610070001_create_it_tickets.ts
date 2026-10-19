import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The IT service desk: tickets, their activity timeline, and screenshot metadata.
 *
 * `itTicketFiles` is a file Collection. Its first seven columns are the fixed File
 * Repository contract; `ticketId` and `uploadedById` are the application-owned
 * association an upload receives when the ticket is submitted.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610070001_create_it_tickets',

  async up({ builder }) {
    await builder.createCollection('itTickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 120 }).notNull();
      collection.text('description').notNull();
      collection
        .string('urgency', { length: 16 })
        .notNull()
        .defaultTo('medium');
      collection
        .string('status', { length: 24 })
        .notNull()
        .defaultTo('pending');
      collection.string('requesterId', { length: 64 }).notNull();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection.text('resolution').nullable();
      collection.datetime('statusChangedAt').notNull();
      collection.datetime('assignedAt').nullable();
      collection.datetime('resolvedAt').nullable();
      collection.datetime('closedAt').nullable();
      collection.datetime('returnedAt').nullable();
      collection.datetime('overdueNotifiedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.index('status');
      collection.index('requesterId');
      collection.index('assigneeId');
      collection.index('createdAt');
      collection.index(['status', 'createdAt']);
    });

    await builder.createCollection('itTicketActivities', (collection) => {
      collection.increments('id');
      collection.integer('ticketId').notNull();
      collection.string('authorId', { length: 64 }).notNull();
      collection.string('type', { length: 24 }).notNull();
      collection.text('content').nullable();
      collection.string('fromStatus', { length: 24 }).nullable();
      collection.string('toStatus', { length: 24 }).nullable();
      collection.datetime('createdAt').notNull();

      collection.index('ticketId');
      collection.index(['ticketId', 'createdAt']);
    });

    await builder.createCollection('itTicketFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.integer('ticketId').nullable();
      collection.string('uploadedById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.index('ticketId');
      collection.index('uploadedById');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('itTicketFiles');
    await builder.dropCollection('itTicketActivities');
    await builder.dropCollection('itTickets');
  },
});

export default migration;
