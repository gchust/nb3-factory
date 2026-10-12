import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The IT help desk's own tables, plus the two collections `@nocobase/lifecycle` requires for the ticket state
 * machine (see `LIFECYCLE_COLLECTIONS`). The library ships no migration helper, so every column its Repository
 * store reads is spelled out here; when a later release of the library needs another column, add it in a new
 * migration rather than editing this one.
 *
 * `ticketAttachments` is the file plugin's file-record collection: the fixed file columns plus `uploadedById`, the
 * principal that uploaded the screenshot. Tickets reference uploaded files by id in `screenshotIds`, because a
 * screenshot belongs to the ticket that was submitted, not to the upload.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610200001_create_helpdesk',

  async up({ builder }) {
    await builder.createCollection('tickets', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('description').notNull();
      collection.string('category', { length: 64 }).nullable();
      // One of low | medium | high | urgent; the urgency the reporter chose.
      collection
        .string('priority', { length: 16 })
        .notNull()
        .defaultTo('medium');
      // The lifecycle state field, changed-at field and version field the ticket lifecycle runs on.
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('submitted');
      collection.datetimeTz('statusChangedAt').notNull();
      collection.integer('lifecycleVersion').notNull().defaultTo(0);
      collection.string('reporterId', { length: 64 }).notNull();
      collection.string('reporterName', { length: 128 }).notNull();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection.string('assigneeName', { length: 128 }).nullable();
      collection.text('resolution').nullable();
      collection.text('serviceDeskNote').nullable();
      collection.text('reopenReason').nullable();
      collection.integer('reopenedCount').notNull().defaultTo(0);
      // The ids of uploaded screenshots, as an array of strings.
      collection.json('screenshotIds').nullable();
      collection.datetimeTz('resolvedAt').nullable();
      collection.datetimeTz('closedAt').nullable();
      // Set by every overdue reminder, so the trigger's next sweep waits another interval.
      collection.datetimeTz('lastReminderAt').nullable();
      collection.datetimeTz('createdAt').notNull();
      collection.datetimeTz('updatedAt').notNull();

      collection.index(['status', 'statusChangedAt'], {
        name: 'idx_tickets_status_changed',
      });
      collection.index('reporterId', { name: 'idx_tickets_reporter' });
      collection.index('assigneeId', { name: 'idx_tickets_assignee' });
    });

    await builder.createCollection('ticketComments', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('ticketId', { length: 64 }).notNull();
      collection.string('authorId', { length: 64 }).notNull();
      collection.string('authorName', { length: 128 }).notNull();
      // One of comment | processing.
      collection.string('kind', { length: 16 }).notNull().defaultTo('comment');
      collection.text('body').notNull();
      collection.datetimeTz('createdAt').notNull();

      collection.index('ticketId', { name: 'idx_ticket_comments_ticket' });
    });

    // The file plugin's own file record: the fixed columns its Repository expects, with the uploader's id.
    await builder.createCollection('ticketAttachments', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.string('uploadedById', { length: 64 }).nullable();
      collection.index('uploadedById', {
        name: 'idx_ticket_attachments_uploader',
      });
    });

    await builder.createCollection('lifecycleTransitions', (collection) => {
      collection.bigInt('id').autoIncrement().primary().notNull();
      collection.string('lifecycle', { length: 64 }).notNull();
      collection.string('recordId', { length: 64 }).notNull();
      collection.string('transition', { length: 64 }).notNull();
      collection.string('from', { length: 32 }).nullable();
      collection.string('to', { length: 32 }).notNull();
      collection.string('actorId', { length: 64 }).notNull();
      collection.json('input').notNull();
      collection.datetimeTz('at').notNull();
      collection.integer('version').notNull();
      collection.string('requestId', { length: 191 }).nullable();
      collection.string('requestKey', { length: 224 }).notNull();

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
      collection.bigInt('id').autoIncrement().primary().notNull();
      collection.bigInt('transitionId').notNull();
      collection.string('lifecycle', { length: 64 }).notNull();
      collection.string('recordId', { length: 64 }).notNull();
      collection.string('effect', { length: 64 }).notNull();
      collection.boolean('stayBound').notNull().defaultTo(false);
      collection.string('status', { length: 16 }).notNull();
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

      collection.index(['lifecycle', 'recordId', 'id'], {
        name: 'idx_lifecycle_effect_runs_record',
      });
      collection.index(['status', 'id'], {
        name: 'idx_lifecycle_effect_runs_status',
      });
      collection.index('continuationDueAt', {
        name: 'idx_lifecycle_effect_runs_due',
      });
      collection.index('continuationAbandonedAt', {
        name: 'idx_lifecycle_effect_runs_abandoned',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('lifecycleEffectRuns');
    await builder.dropCollection('lifecycleTransitions');
    await builder.dropCollection('ticketAttachments');
    await builder.dropCollection('ticketComments');
    await builder.dropCollection('tickets');
  },
});

export default migration;
