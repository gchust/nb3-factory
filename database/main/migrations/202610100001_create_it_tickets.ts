import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * IT service desk schema: a ticket submitted by an employee, the timeline of what happened to it, the screenshots
 * attached to it, and the small table that says who is an engineer and who works the service desk.
 *
 * The shape is spelled out here rather than imported from a live collection definition, because a migration is
 * historical record: a later change to those definitions must become a new migration, not silently change what this
 * one already applied.
 *
 * `itTickets.status` is a plain string so the lifecycle can grow without a database migration; the allowed values live
 * in the ticket service. Timestamps are stored without a time zone because every deployment runs in one.
 *
 * Nothing carries a database foreign key: user ids come from the authentication tables, whose lifecycle the
 * application does not own, and a stale user id must not block a ticket from being written or read. The id is the
 * 64-character string Better Auth uses for `user`.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610100001_create_it_tickets',

  async up({ builder }) {
    await builder.createCollection('itTickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200 }).notNull();
      collection.text('description').notNull();
      collection
        .string('urgency', { length: 16 })
        .notNull()
        .defaultTo('normal');
      collection
        .string('status', { length: 16 })
        .notNull()
        .defaultTo('pending');
      collection.datetime('statusChangedAt').notNull();
      collection.string('reporterId', { length: 64 }).notNull();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection.text('resolution').nullable();
      collection.datetime('resolvedAt').nullable();
      collection.datetime('closedAt').nullable();
      collection.string('closedById', { length: 64 }).nullable();
      collection.datetime('remindedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.index('reporterId', { name: 'ix_it_tickets_reporter' });
      collection.index('assigneeId', { name: 'ix_it_tickets_assignee' });
      collection.index('status', { name: 'ix_it_tickets_status' });
    });

    await builder.createCollection('itTicketRecords', (collection) => {
      collection.increments('id');
      collection.integer('ticketId').notNull();
      collection.string('authorId', { length: 64 }).nullable();
      collection.string('kind', { length: 16 }).notNull();
      collection.text('content').nullable();
      collection.string('fromStatus', { length: 16 }).nullable();
      collection.string('toStatus', { length: 16 }).nullable();
      collection.datetime('createdAt').notNull();

      collection.index('ticketId', { name: 'ix_it_ticket_records_ticket' });
    });

    // The fixed columns the file plugin's Repository writes for every upload. `ticketId` and `uploaderId` are the
    // application-owned link back to a ticket and to whoever uploaded it; both stay nullable so an upload can be
    // stored before the ticket form is submitted.
    await builder.createCollection('itTicketFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.integer('ticketId').nullable();
      collection.string('uploaderId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.index('ticketId', { name: 'ix_it_ticket_files_ticket' });
    });

    await builder.createCollection('itTeamMembers', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64 }).notNull();
      collection.string('role', { length: 16 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.unique('userId', { name: 'uq_it_team_members_user' });
      collection.index('role', { name: 'ix_it_team_members_role' });
    });
  },

  async down({ builder }) {
    // Children first, then the ticket table, in the reverse order they were created.
    await builder.dropCollection('itTeamMembers');
    await builder.dropCollection('itTicketFiles');
    await builder.dropCollection('itTicketRecords');
    await builder.dropCollection('itTickets');
  },
});

export default migration;
