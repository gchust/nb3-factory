import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The helpdesk schema: tickets, their conversation, attachments, the file rows
 * the file plugin owns, the lifecycle log tables, and the small settings table
 * an administrator edits for reminder policy.
 *
 * Every column is spelled out here because this migration is history. The
 * lifecycle log columns follow the contract of the installed
 * `@nocobase/lifecycle` repository store; a later change to that package needs
 * a new alteration migration rather than an edit to this file.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010001_create_helpdesk',

  async up({ builder }) {
    await builder.createCollection('helpdeskTickets', (collection) => {
      collection.uuid('id', { length: 36 }).notNull();
      collection.string('ticketNo', { length: 32 }).notNull();
      collection.string('title', { length: 200 }).notNull();
      collection.text('description').notNull();
      collection.string('category', { length: 32 }).notNull();
      collection.string('priority', { length: 16 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.datetimeTz('statusChangedAt').notNull();
      collection.integer('lifecycleVersion').notNull().defaultTo(0);
      collection.string('reporterId', { length: 64 }).notNull();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection.text('resolution').nullable();
      collection.datetimeTz('resolvedAt').nullable();
      collection.datetimeTz('closedAt').nullable();
      collection.datetimeTz('lastReminderAt').nullable();
      collection.datetimeTz('createdAt').notNull();
      collection.datetimeTz('updatedAt').notNull();

      collection.primary('id', { name: 'pk_helpdesk_tickets' });
      collection.unique('ticketNo', { name: 'uq_helpdesk_tickets_no' });
      collection.index(['status', 'statusChangedAt'], {
        name: 'idx_helpdesk_tickets_status_wait',
      });
      collection.index('reporterId', { name: 'idx_helpdesk_tickets_reporter' });
      collection.index('assigneeId', { name: 'idx_helpdesk_tickets_assignee' });
      collection.index('createdAt', { name: 'idx_helpdesk_tickets_created' });
    });

    await builder.createCollection('helpdeskComments', (collection) => {
      collection.uuid('id', { length: 36 }).notNull();
      collection.uuid('ticketId', { length: 36 }).notNull();
      collection.string('authorId', { length: 64 }).nullable();
      collection.string('kind', { length: 32 }).notNull();
      collection.text('body').notNull();
      collection.datetimeTz('createdAt').notNull();

      collection.primary('id', { name: 'pk_helpdesk_comments' });
      collection.index(['ticketId', 'createdAt'], {
        name: 'idx_helpdesk_comments_ticket',
      });
    });

    await builder.createCollection('helpdeskFiles', (collection) => {
      collection.uuid('id', { length: 36 }).notNull();
      collection.string('disk', { length: 64 }).notNull();
      collection.string('key', { length: 500 }).notNull();
      collection.string('filename', { length: 255 }).notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 191 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetimeTz('createdAt').notNull();
      collection.datetimeTz('updatedAt').notNull();

      collection.primary('id', { name: 'pk_helpdesk_files' });
      collection.unique('key', { name: 'uq_helpdesk_files_key' });
    });

    await builder.createCollection('helpdeskAttachments', (collection) => {
      collection.uuid('id', { length: 36 }).notNull();
      collection.uuid('ticketId', { length: 36 }).notNull();
      collection.uuid('fileId', { length: 36 }).notNull();
      collection.string('uploadedById', { length: 64 }).notNull();
      collection.datetimeTz('createdAt').notNull();

      collection.primary('id', { name: 'pk_helpdesk_attachments' });
      collection.index(['ticketId', 'createdAt'], {
        name: 'idx_helpdesk_attachments_ticket',
      });
      collection.index('fileId', { name: 'idx_helpdesk_attachments_file' });
    });

    await builder.createCollection('helpdeskSettings', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.integer('reminderHours').notNull().defaultTo(24);
      collection.datetimeTz('updatedAt').notNull();

      collection.primary('id', { name: 'pk_helpdesk_settings' });
    });

    await builder.createCollection('lifecycleTransitions', (collection) => {
      collection.increments('id');
      collection.string('lifecycle', { length: 64 }).notNull();
      collection.string('recordId', { length: 64 }).notNull();
      collection.string('transition', { length: 64 }).notNull();
      collection.string('from', { length: 64 }).nullable();
      collection.string('to', { length: 64 }).notNull();
      collection.string('actorId', { length: 64 }).notNull();
      collection.json('input').notNull();
      collection.datetimeTz('at').notNull();
      collection.integer('version').notNull();
      collection.string('requestId', { length: 255 }).nullable();
      collection.string('requestKey', { length: 255 }).notNull();

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
      collection.increments('id');
      collection.bigInt('transitionId').notNull();
      collection.string('lifecycle', { length: 64 }).notNull();
      collection.string('recordId', { length: 64 }).notNull();
      collection.string('effect', { length: 191 }).notNull();
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
    for (const name of [
      'lifecycleEffectRuns',
      'lifecycleTransitions',
      'helpdeskSettings',
      'helpdeskAttachments',
      'helpdeskFiles',
      'helpdeskComments',
      'helpdeskTickets',
    ]) {
      await builder.dropCollection(name);
    }
  },
});

export default migration;
