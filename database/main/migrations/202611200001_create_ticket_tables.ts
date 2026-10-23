import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * IT Service Desk tables: the `tickets` record collection its lifecycle runs on, the `ticketComments`
 * discussion/audit table, and the two `@nocobase/lifecycle` log collections every lifecycle in the application
 * shares.
 *
 * The lifecycle library ships no migration, so its schema is spelled out here rather than imported from a live
 * definition: `lifecycleTransitions` and `lifecycleEffectRuns` must keep exactly these columns and indexes, or the
 * runtime's Repository store cannot read its own history. `tickets` carries the three fields the runtime requires
 * (state, changed-at, version) plus the business fields the service desk owns.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611200001_create_ticket_tables',

  async up({ builder }) {
    await builder.createCollection('tickets', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('description').nullable();
      collection.string('category', { length: 64 }).nullable();
      // One of `low | normal | high | urgent`; validated in the API layer, not by an enum column, so a later
      // release can add a level without an alter on SQLite.
      collection.string('urgency', { length: 32 }).notNull().defaultTo('normal');

      // The lifecycle's three required columns.
      collection.string('status', { length: 32 }).notNull();
      collection.datetimeTz('statusChangedAt').notNull();
      collection.integer('lifecycleVersion').notNull().defaultTo(0);

      collection.string('reporterId', { length: 64 }).notNull();
      collection.string('reporterName', { length: 255 }).notNull();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection.string('assigneeName', { length: 255 }).nullable();
      collection.text('resolution').nullable();
      collection.datetimeTz('resolvedAt').nullable();
      collection.datetimeTz('closedAt').nullable();
      collection.integer('reopenCount').notNull().defaultTo(0);
      collection.datetimeTz('lastReopenedAt').nullable();
      // Set by the overdue sweep, not by a transition: the sweep skips a ticket it already reminded about
      // within the reminder window, so a long-open ticket does not spam the service desk every minute.
      collection.datetimeTz('overdueNotifiedAt').nullable();
      collection.string('attachmentId', { length: 36 }).nullable();

      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_tickets' });
      // The trigger sweep reads `(status, statusChangedAt)`.
      collection.index(['status', 'statusChangedAt'], {
        name: 'idx_tickets_status_changed',
      });
      collection.index('reporterId', { name: 'idx_tickets_reporter' });
      collection.index('assigneeId', { name: 'idx_tickets_assignee' });
      collection.index('createdAt', { name: 'idx_tickets_created' });
    });

    await builder.createCollection('ticketComments', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('ticketId', { length: 64 }).notNull();
      collection.string('authorId', { length: 64 }).notNull();
      collection.string('authorName', { length: 255 }).notNull();
      // `comment` (a person's note), `resolution` (the engineer's resolution text), `system` (a transition the
      // service wrote for the record's history).
      collection.string('kind', { length: 32 }).notNull().defaultTo('comment');
      collection.text('body').notNull();

      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_ticket_comments' });
      collection.index('ticketId', { name: 'idx_ticket_comments_ticket' });
    });

    await builder.createCollection('lifecycleTransitions', (collection) => {
      collection.bigInt('id').autoIncrement().notNull();
      collection.string('lifecycle', { length: 128 }).notNull();
      collection.string('recordId', { length: 64 }).notNull();
      collection.string('transition', { length: 128 }).notNull();
      collection.string('from', { length: 32 }).nullable();
      collection.string('to', { length: 32 }).notNull();
      collection.string('actorId', { length: 64 }).notNull();
      collection.json('input').notNull();
      collection.datetimeTz('at').notNull();
      collection.integer('version').notNull();
      collection.string('requestId', { length: 128 }).nullable();
      collection.string('requestKey', { length: 160 }).notNull();

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
      collection.bigInt('id').autoIncrement().notNull();
      collection.bigInt('transitionId').notNull();
      collection.string('lifecycle', { length: 128 }).notNull();
      collection.string('recordId', { length: 64 }).notNull();
      collection.string('effect', { length: 160 }).notNull();
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
    await builder.dropCollection('ticketComments');
    await builder.dropCollection('tickets');
  },
});

export default migration;
