import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the service desk's own tables:
 *
 * - `tickets` — the lifecycle record. `status`, `statusChangedAt` and `lifecycleVersion` are owned by the
 *   `tickets` lifecycle and must not be written by anything else; every other column is business data.
 * - `ticketNotes` — the handling process an engineer records while a ticket is open, and the comments anyone adds.
 * - `ticketFiles` — the file collection the File plugin's repository uploads into. Its columns are fixed by the
 *   plugin's upload contract (see the File plugin Skill); a later release adding a field is a new migration.
 * - `serviceDeskStaff` — who is an engineer and who is on the service desk. Everyone else is an employee who may
 *   only see tickets they raised. This is application-owned role data rather than a permission set, because the
 *   record scope (own / assigned / all) is bespoke business logic; see `server/AGENTS.md`.
 *
 * Attachment ids are stored on the ticket as a JSON array of `ticketFiles.id`, so the ticket and its files share
 * one aggregate. Delete removes the link; the file row itself is deleted through the file repository.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010001_create_service_desk',

  async up({ builder }) {
    await builder.createCollection('tickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.text('description').notNull();
      collection.string('category', { length: 64 }).nullable();
      collection.string('location', { length: 255 }).nullable();
      collection.string('urgency', { length: 16 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.datetimeTz('statusChangedAt').notNull();
      collection.integer('lifecycleVersion', { defaultValue: 0 }).notNull();
      collection.string('requesterId', { length: 64 }).notNull();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection.text('solution').nullable();
      collection.text('returnReason').nullable();
      collection.json('attachmentIds').nullable();
      collection.datetimeTz('createdAt').notNull();
      collection.datetimeTz('updatedAt').notNull();

      collection.index('status', { name: 'idx_tickets_status' });
      collection.index('requesterId', { name: 'idx_tickets_requester_id' });
      collection.index('assigneeId', { name: 'idx_tickets_assignee_id' });
    });

    await builder.createCollection('ticketNotes', (collection) => {
      collection.increments('id');
      collection.integer('ticketId').notNull();
      collection.string('authorId', { length: 64 }).notNull();
      // 'handling' is an engineer's process note, 'comment' a general note, 'system' a recorded automated step.
      collection.string('kind', { length: 16 }).notNull();
      collection.text('content').notNull();
      collection.datetimeTz('createdAt').notNull();

      collection.index('ticketId', { name: 'idx_ticket_notes_ticket_id' });
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

    await builder.createCollection('serviceDeskStaff', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64 }).notNull();
      collection.string('role', { length: 16 }).notNull();
      collection.datetimeTz('createdAt').notNull();
      collection.datetimeTz('updatedAt').notNull();

      collection.unique('userId', { name: 'uq_service_desk_staff_user_id' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('serviceDeskStaff');
    await builder.dropCollection('ticketFiles');
    await builder.dropCollection('ticketNotes');
    await builder.dropCollection('tickets');
  },
});

export default migration;
