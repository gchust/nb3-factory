import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the service desk tables.
 *
 * `tickets` is the ticket itself: who asked, what the issue is, how urgent it
 * is, where it is in the workflow, and who currently owns it. `status` moves
 * `pending` -> `processing` -> `resolved` -> `closed`; a returned ticket goes
 * `resolved` -> `processing` again. `lifecycleVersion` is bumped on every
 * transition so a concurrent writer's update predicate fails instead of
 * overwriting a status somebody else already changed.
 *
 * `ticketNotes` records the handling process as free text, `ticketTransitions`
 * is the append-only audit trail of every workflow action, and `ticketFiles`
 * is the App-owned file collection screenshots are uploaded into.
 *
 * User references (`requesterId`, `assigneeId`, `actorId`, `authorId`) are
 * plain strings from the Better Auth user table; they are indexed but not
 * foreign-keyed, so this schema does not depend on another package's table
 * definition.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010001_create_service_desk',

  async up({ builder }) {
    await builder.createCollection('tickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200, nullable: false });
      collection.text('description', { nullable: false });
      collection.string('urgency', { length: 32, nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.string('requesterId', { length: 64, nullable: false });
      collection.string('assigneeId', { length: 64, nullable: true });
      collection.text('resolution', { nullable: true });
      collection.json('attachmentIds', { nullable: true });
      collection.datetime('statusChangedAt', { nullable: false });
      collection.integer('lifecycleVersion', {
        nullable: false,
        defaultValue: 1,
      });
      collection.datetime('overdueNotifiedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });

      collection.primary('id', { name: 'pk_tickets' });
      collection.index('status', { name: 'idx_tickets_status' });
      collection.index('requesterId', { name: 'idx_tickets_requester' });
      collection.index('assigneeId', { name: 'idx_tickets_assignee' });
      collection.index('statusChangedAt', {
        name: 'idx_tickets_status_changed',
      });
    });

    await builder.createCollection('ticketNotes', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('authorId', { length: 64, nullable: false });
      collection.text('content', { nullable: false });
      collection.datetime('createdAt', { nullable: false });

      collection.primary('id', { name: 'pk_ticket_notes' });
      collection.index('ticketId', { name: 'idx_ticket_notes_ticket' });
    });

    await builder.createCollection('ticketTransitions', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('action', { length: 32, nullable: false });
      collection.string('fromStatus', { length: 32, nullable: false });
      collection.string('toStatus', { length: 32, nullable: false });
      collection.string('actorId', { length: 64, nullable: false });
      collection.json('payload', { nullable: true });
      collection.datetime('createdAt', { nullable: false });

      collection.primary('id', { name: 'pk_ticket_transitions' });
      collection.index('ticketId', { name: 'idx_ticket_transitions_ticket' });
    });

    await builder.createCollection('ticketFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
  },

  async down({ builder }) {
    await builder.dropCollection('ticketFiles');
    await builder.dropCollection('ticketTransitions');
    await builder.dropCollection('ticketNotes');
    await builder.dropCollection('tickets');
  },
});

export default migration;
