import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * IT service desk: repair tickets, their handling history, and the application-owned
 * staff profile that decides what a signed-in user may do with a ticket.
 *
 * The tables reference `user` rows by a plain string id (Better Auth mints string ids),
 * deliberately without a cross-plugin foreign key so this migration can run before or
 * independently of the authentication plugin's tables. Every field, index and default
 * the runtime relies on is spelled out here; nothing is imported from a live collection
 * definition.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_create_helpdesk_tables',
  async up({ builder }) {
    await builder.createCollection('helpDeskTickets', (collection) => {
      collection.increments('id');
      collection.string('ticketNo', { length: 32 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('description').notNull();
      collection
        .string('urgency', { length: 16 })
        .notNull()
        .defaultTo('normal');
      collection
        .string('status', { length: 24 })
        .notNull()
        .defaultTo('pending');
      collection.string('reporterId', { length: 64 }).notNull();
      collection.string('reporterName', { length: 255 }).notNull();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection.string('assigneeName', { length: 255 }).nullable();
      collection.text('screenshot').nullable();
      collection.text('solution').nullable();
      collection.text('lastRejectedReason').nullable();
      collection.datetime('resolvedAt').nullable();
      collection.datetime('closedAt').nullable();
      collection.datetime('remindedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_helpdeskTickets' });
      collection.unique('ticketNo', { name: 'uq_helpdeskTickets_no' });
      collection.index('status', { name: 'idx_helpdeskTickets_status' });
      collection.index('reporterId', { name: 'idx_helpdeskTickets_reporter' });
      collection.index('assigneeId', { name: 'idx_helpdeskTickets_assignee' });
    });

    await builder.createCollection('helpDeskTicketLogs', (collection) => {
      collection.increments('id');
      collection.integer('ticketId').notNull();
      collection.string('action', { length: 32 }).notNull();
      collection.text('content').nullable();
      collection.string('authorId', { length: 64 }).nullable();
      collection.string('authorName', { length: 255 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_helpDeskTicketLogs' });
      collection.index('ticketId', { name: 'idx_helpDeskTicketLogs_ticket' });
    });

    await builder.createCollection('helpdeskProfiles', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64 }).notNull();
      collection.string('role', { length: 24 }).notNull();
      collection.string('displayName', { length: 255 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_helpdeskProfiles' });
      collection.unique('userId', { name: 'uq_helpdeskProfiles_user' });
      collection.index('role', { name: 'idx_helpdeskProfiles_role' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('helpDeskTicketLogs');
    await builder.dropCollection('helpDeskTickets');
    await builder.dropCollection('helpdeskProfiles');
  },
});

export default migration;
