import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The IT service desk: repair tickets, their attachments, and the two log tables `@nocobase/lifecycle` reads and
 * writes. Every field is spelled out here rather than built from the lifecycle definition or the file plugin's
 * `FILE_COLUMNS`, because a migration is fixed history: a later release changing either must not change what this
 * migration already did.
 *
 * `tickets.status`, `tickets.statusChangedAt` and `tickets.lifecycleVersion` are the lifecycle-owned fields — only
 * `LifecycleRuntime` may write them. `it_ticket_files` carries the file plugin's required columns plus the uploader,
 * which the exposure's record access scopes to the caller.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610140001_create_it_service_desk',

  async up({ builder }) {
    await builder.createCollection('tickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.text('description').notNull();
      collection
        .string('urgency', { length: 32 })
        .notNull()
        .defaultTo('normal');
      collection.string('reporterId', { length: 64 }).notNull();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection.text('handlingNote').nullable();
      collection.text('solution').nullable();
      collection.json('attachmentIds').nullable();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.datetimeTz('statusChangedAt').notNull();
      collection.integer('lifecycleVersion').notNull().defaultTo(0);
      collection.datetimeTz('assignedAt').nullable();
      collection.datetimeTz('resolvedAt').nullable();
      collection.datetimeTz('closedAt').nullable();
      collection.integer('returnedCount').notNull().defaultTo(0);
      collection.text('lastReturnReason').nullable();
      collection.datetimeTz('remindedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.index(['status', 'statusChangedAt'], {
        name: 'idx_tickets_status_changed_at',
      });
      collection.index(['reporterId'], { name: 'idx_tickets_reporter' });
      collection.index(['assigneeId'], { name: 'idx_tickets_assignee' });
    });

    await builder.createCollection('it_ticket_files', (collection) => {
      collection.uuid('id').notNull().primary();
      collection.string('disk', { length: 64 }).notNull();
      collection.string('key', { length: 255 }).notNull();
      collection.string('filename', { length: 255 }).notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.string('uploadedById', { length: 64 }).nullable();

      collection.index(['uploadedById'], {
        name: 'idx_it_ticket_files_uploader',
      });
    });

    // One pair of log tables serves every lifecycle in the application.
    await builder.createCollection('lifecycleTransitions', (collection) => {
      collection.bigInt('id').autoIncrement().primary();
      collection.string('lifecycle', { length: 191 }).notNull();
      collection.string('recordId', { length: 191 }).notNull();
      collection.string('transition', { length: 191 }).notNull();
      collection.string('from', { length: 191 }).nullable();
      collection.string('to', { length: 191 }).notNull();
      collection.string('actorId', { length: 191 }).notNull();
      collection.json('input').nullable();
      collection.datetimeTz('at').notNull();
      collection.integer('version').notNull();
      collection.string('requestId', { length: 191 }).nullable();
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
      collection.bigInt('id').autoIncrement().primary();
      collection.bigInt('transitionId').notNull();
      collection.string('lifecycle', { length: 191 }).notNull();
      collection.string('recordId', { length: 191 }).notNull();
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
      collection.index(['continuationDueAt'], {
        name: 'idx_lifecycle_effect_runs_due',
      });
      collection.index(['continuationAbandonedAt'], {
        name: 'idx_lifecycle_effect_runs_abandoned',
      });
    });
  },

  async down({ builder }) {
    // Reverse dependency order: the log tables first, then the attachments and tickets.
    await builder.dropCollection('lifecycleEffectRuns');
    await builder.dropCollection('lifecycleTransitions');
    await builder.dropCollection('it_ticket_files');
    await builder.dropCollection('tickets');
  },
});

export default migration;
