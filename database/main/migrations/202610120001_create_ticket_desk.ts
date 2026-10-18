import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The IT service desk's own tables.
 *
 * - `ticketStaff` records who is an engineer or belongs to the service desk. Every authenticated user without a row is
 *   an employee, which is why nothing has to be created for the people who only submit issues.
 * - `tickets` is the record table the `ticket` lifecycle runs on. Besides its business fields it carries the three
 *   columns a lifecycle needs: `status` (the state), `statusChangedAt` (the changed-at instant its triggers sweep on)
 *   and `lifecycleVersion` (its optimistic version). `status`, `statusChangedAt` and `lifecycleVersion` are written by
 *   the lifecycle runtime only.
 * - `ticketComments` is the running record of what people did to a ticket: the handling process an engineer writes and
 *   the reasons a requester gives for returning it.
 * - `ticketAttachments` holds screenshots' metadata. The bytes live on a configured drive disk; the row names the disk
 *   and key, and the application serves the content through its own authenticated route, so a UUID alone never exposes
 *   somebody else's screenshot.
 *
 * All instants are `datetimeTz`: a ticket's 24-hour reminder is measured in absolute time, not the server's timezone.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610120001_create_ticket_desk',

  async up({ builder }) {
    await builder.createCollection('ticketStaff', (collection) => {
      collection.title('Ticket desk staff');
      collection.increments('id');
      collection.string('userId', { length: 64, nullable: false });
      collection.string('role', { length: 32, nullable: false });
      collection.string('displayName', { length: 255, nullable: true });
      collection.datetimeTz('createdAt', { nullable: false });
      collection.datetimeTz('updatedAt', { nullable: false });

      collection.unique('userId', { name: 'uq_ticket_staff_user' });
      collection.index('role');
    });

    await builder.createCollection('tickets', (collection) => {
      collection.title('Tickets');
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.text('description', { nullable: false });
      collection.string('urgency', { length: 16, nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.datetimeTz('statusChangedAt', { nullable: false });
      collection.integer('lifecycleVersion', {
        nullable: false,
        defaultValue: 0,
      });

      collection.string('requesterId', { length: 64, nullable: false });
      collection.string('requesterName', { length: 255, nullable: false });
      collection.string('assigneeId', { length: 64, nullable: true });
      collection.string('assigneeName', { length: 255, nullable: true });

      collection.text('resolution', { nullable: true });
      collection.text('lastReason', { nullable: true });
      collection.datetimeTz('assignedAt', { nullable: true });
      collection.datetimeTz('resolvedAt', { nullable: true });
      collection.datetimeTz('closedAt', { nullable: true });
      collection.datetimeTz('remindedAt', { nullable: true });

      collection.datetimeTz('createdAt', { nullable: false });
      collection.datetimeTz('updatedAt', { nullable: false });

      // The trigger sweep reads idle records by state and changed-at instant.
      collection.index(['status', 'statusChangedAt'], {
        name: 'idx_tickets_status_changed',
      });
      collection.index(['requesterId', 'createdAt'], {
        name: 'idx_tickets_requester',
      });
      collection.index(['assigneeId', 'createdAt'], {
        name: 'idx_tickets_assignee',
      });
    });

    await builder.createCollection('ticketComments', (collection) => {
      collection.title('Ticket comments');
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('authorId', { length: 64, nullable: false });
      collection.string('authorName', { length: 255, nullable: false });
      // `comment` — a note in the handling process; `reason` — why a requester returned the ticket.
      collection.string('kind', { length: 32, nullable: false });
      collection.text('body', { nullable: false });
      collection.datetimeTz('createdAt', { nullable: false });

      collection.index(['ticketId', 'createdAt'], {
        name: 'idx_ticket_comments_ticket',
      });
      collection.foreignKey('ticketId', {
        references: { collection: 'tickets', fields: ['id'] },
        name: 'fk_ticket_comments_ticket',
      });
    });

    await builder.createCollection('ticketAttachments', (collection) => {
      collection.title('Ticket attachments');
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('uploaderId', { length: 64, nullable: false });
      collection.string('disk', { length: 64, nullable: false });
      collection.string('key', { length: 512, nullable: false });
      collection.string('filename', { length: 255, nullable: false });
      collection.string('mimeType', { length: 128, nullable: false });
      collection.integer('size', { nullable: false });
      collection.datetimeTz('createdAt', { nullable: false });

      collection.unique('key', { name: 'uq_ticket_attachments_key' });
      collection.index(['ticketId', 'createdAt'], {
        name: 'idx_ticket_attachments_ticket',
      });
      collection.foreignKey('ticketId', {
        references: { collection: 'tickets', fields: ['id'] },
        name: 'fk_ticket_attachments_ticket',
      });
    });
  },

  async down({ builder }) {
    // Children before parents, so no foreign key is left dangling.
    await builder.dropCollection('ticketAttachments');
    await builder.dropCollection('ticketComments');
    await builder.dropCollection('tickets');
    await builder.dropCollection('ticketStaff');
  },
});

export default migration;
