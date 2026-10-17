import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The IT service desk schema: a ticket, its process log, and the file
 * collection its screenshots are uploaded into.
 *
 * A ticket moves through pending -> processing -> resolved -> closed and can
 * be returned to processing when the requester does not accept the result.
 * `requesterId` and `assigneeId` reference Better Auth users; they are stored
 * as plain string columns so this migration stays self-contained and does not
 * depend on the authentication plugin's own migration order.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611150001_create_service_tickets',

  async up({ builder }) {
    await builder.createCollection('serviceTickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.text('description', { nullable: false });
      collection.string('urgency', {
        length: 16,
        nullable: false,
        defaultValue: 'medium',
      });
      collection.string('status', {
        length: 24,
        nullable: false,
        defaultValue: 'pending',
      });
      collection.string('requesterId', { length: 64, nullable: false });
      collection.string('requesterName', { length: 128 });
      collection.string('assigneeId', { length: 64 });
      collection.string('assigneeName', { length: 128 });
      collection.text('resolution');
      collection.json('screenshotIds');
      collection.datetime('submittedAt', { nullable: false });
      collection.datetime('assignedAt');
      collection.datetime('resolvedAt');
      collection.datetime('closedAt');
      collection.datetime('reminderSentAt');
      collection.datetime('lastReturnedAt');
      collection.integer('returnCount', { nullable: false, defaultValue: 0 });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('status');
      collection.index('assigneeId');
      collection.index('requesterId');
    });

    await builder.createCollection('serviceTicketLogs', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('authorId', { length: 64 });
      collection.string('authorName', { length: 128 });
      collection.string('kind', { length: 24, nullable: false });
      collection.text('content', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.index('ticketId');
    });

    await builder.createCollection('serviceTicketFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255, nullable: false });
      collection.text('key', { nullable: false });
      collection.text('filename', { nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });
  },

  async down({ builder }) {
    // Children before parents; the log and file tables reference a ticket by id.
    await builder.dropCollection('serviceTicketLogs');
    await builder.dropCollection('serviceTicketFiles');
    await builder.dropCollection('serviceTickets');
  },
});

export default migration;
