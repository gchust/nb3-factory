import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the helpdesk tables, the application-owned file table and the
 * @nocobase/lifecycle store. Every field is spelled out here so a later
 * release of the lifecycle library or a live declaration cannot change what
 * this migration already did.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610070001_create_helpdesk_tables',

  async up({ builder }) {
    await builder.createCollection('ticket_files', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.string('ownerId', { length: 64 }).nullable();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.index('ownerId', { name: 'idx_ticket_files_owner' });
    });

    await builder.createCollection('tickets', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('ticketNo', { length: 40 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('description').notNull();
      collection.string('category', { length: 32 }).notNull();
      collection.string('priority', { length: 16 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.string('requesterId', { length: 64 }).notNull();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection.text('resolution').nullable();
      collection.text('closeNote').nullable();
      collection.text('cancelReason').nullable();
      collection.datetimeTz('statusChangedAt').notNull();
      collection.integer('lifecycleVersion').notNull().defaultTo(0);
      collection.datetimeTz('resolvedAt').nullable();
      collection.datetimeTz('closedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_tickets' });
      collection.unique('ticketNo', { name: 'uq_tickets_ticket_no' });
      collection.index(['status', 'statusChangedAt'], {
        name: 'idx_tickets_status_changed_at',
      });
      collection.index('requesterId', { name: 'idx_tickets_requester' });
      collection.index('assigneeId', { name: 'idx_tickets_assignee' });
    });

    await builder.createCollection('ticketComments', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('ticketId', { length: 64 }).notNull();
      collection.string('authorId', { length: 64 }).notNull();
      collection.text('body').notNull();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_ticket_comments' });
      collection.index(['ticketId', 'createdAt'], {
        name: 'idx_ticket_comments_ticket_created',
      });
      collection.index('authorId', { name: 'idx_ticket_comments_author' });
    });

    await builder.createCollection('ticketAttachments', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('ticketId', { length: 64 }).notNull();
      collection.string('attachmentId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_ticket_attachments' });
      collection.unique(['ticketId', 'attachmentId'], {
        name: 'uq_ticket_attachments_ticket_file',
      });
      collection.index('ticketId', {
        name: 'idx_ticket_attachments_ticket',
      });
      collection.index('attachmentId', {
        name: 'idx_ticket_attachments_attachment',
      });
    });

    await builder.createCollection('lifecycleTransitions', (collection) => {
      collection.bigInt('id', { autoIncrement: true }).notNull();
      collection.string('lifecycle', { length: 128 }).notNull();
      collection.string('recordId', { length: 128 }).notNull();
      collection.string('transition', { length: 128 }).notNull();
      collection.string('from', { length: 64 }).nullable();
      collection.string('to', { length: 64 }).notNull();
      collection.string('actorId', { length: 128 }).notNull();
      collection.json('input').notNull();
      collection.datetimeTz('at').notNull();
      collection.integer('version').notNull();
      collection.string('requestId', { length: 255 }).nullable();
      collection.string('requestKey', { length: 255 }).notNull();

      collection.primary('id', { name: 'pk_lifecycle_transitions' });
      collection.unique(['lifecycle', 'recordId', 'version'], {
        name: 'uq_lifecycle_transitions_version',
      });
      collection.unique(['lifecycle', 'recordId', 'requestKey'], {
        name: 'uq_lifecycle_transitions_request',
      });
      collection.index(['lifecycle', 'recordId', 'id'], {
        name: 'idx_lifecycle_transitions_record',
      });
    });

    await builder.createCollection('lifecycleEffectRuns', (collection) => {
      collection.bigInt('id', { autoIncrement: true }).notNull();
      collection.bigInt('transitionId').notNull();
      collection.string('lifecycle', { length: 128 }).notNull();
      collection.string('recordId', { length: 128 }).notNull();
      collection.string('effect', { length: 128 }).notNull();
      collection.boolean('stayBound').notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.integer('attempts').notNull().defaultTo(0);
      collection.integer('maxAttempts').notNull().defaultTo(1);
      collection.json('result').nullable();
      collection.text('error').nullable();
      collection.datetimeTz('createdAt').notNull();
      collection.datetimeTz('updatedAt').notNull();
      collection.datetimeTz('claimedAt').nullable();
      collection.datetimeTz('runAfter').nullable();
      collection.json('continuation').nullable();
      collection.datetimeTz('continuationDueAt').nullable();
      collection.datetimeTz('continuationAbandonedAt').nullable();

      collection.primary('id', { name: 'pk_lifecycle_effect_runs' });
      collection.index(['status', 'id'], {
        name: 'idx_lifecycle_effect_runs_status',
      });
      collection.index(['lifecycle', 'recordId', 'id'], {
        name: 'idx_lifecycle_effect_runs_record',
      });
      collection.index('continuationDueAt', {
        name: 'idx_lifecycle_effect_runs_continuation_due',
      });
      collection.index('continuationAbandonedAt', {
        name: 'idx_lifecycle_effect_runs_continuation_abandoned',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('lifecycleEffectRuns');
    await builder.dropCollection('lifecycleTransitions');
    await builder.dropCollection('ticketAttachments');
    await builder.dropCollection('ticketComments');
    await builder.dropCollection('tickets');
    await builder.dropCollection('ticket_files');
  },
});

export default migration;
