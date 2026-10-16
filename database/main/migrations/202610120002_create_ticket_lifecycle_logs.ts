import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The two log tables `@nocobase/lifecycle` reads and writes for every lifecycle in this application. The library ships
 * no migration, so the shape is spelled out here from `createRepositoryLifecycleStore()`'s contract and must not be
 * derived from a definition at run time.
 *
 * `lifecycleTransitions` is the audit trail: one row per fired transition, unique per record version and per caller
 * request key (the non-null `requestKey`, which is the caller's `requestId` or `$v:<version>` without one).
 * `lifecycleEffectRuns` is one row per effect a transition owes: its status and attempts are how a run is retried,
 * recovered and inspected, and the three continuation columns are how a waiting, and an abandoned, continuation is
 * found without filtering inside JSON.
 *
 * All instants are `datetimeTz`, matching every other instant the application stores.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610120002_create_ticket_lifecycle_logs',

  async up({ builder }) {
    await builder.createCollection('lifecycleTransitions', (collection) => {
      collection.title('Lifecycle transitions');
      collection.increments('id');
      collection.string('lifecycle', { length: 64, nullable: false });
      collection.string('recordId', { length: 64, nullable: false });
      collection.string('transition', { length: 64, nullable: false });
      collection.string('from', { length: 64, nullable: true });
      collection.string('to', { length: 64, nullable: false });
      collection.string('actorId', { length: 64, nullable: false });
      collection.json('input', { nullable: true });
      collection.datetimeTz('at', { nullable: false });
      collection.integer('version', { nullable: false });
      collection.string('requestId', { length: 191, nullable: true });
      collection.string('requestKey', { length: 191, nullable: false });

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
      collection.title('Lifecycle effect runs');
      collection.increments('id');
      collection.integer('transitionId', { nullable: false });
      collection.string('lifecycle', { length: 64, nullable: false });
      collection.string('recordId', { length: 64, nullable: false });
      collection.string('effect', { length: 128, nullable: false });
      collection.boolean('stayBound', { nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.integer('attempts', { nullable: false, defaultValue: 0 });
      collection.integer('maxAttempts', { nullable: false, defaultValue: 1 });
      collection.json('result', { nullable: true });
      collection.text('error', { nullable: true });
      collection.datetimeTz('createdAt', { nullable: false });
      collection.datetimeTz('updatedAt', { nullable: false });
      collection.datetimeTz('claimedAt', { nullable: true });
      collection.datetimeTz('runAfter', { nullable: true });
      collection.json('continuation', { nullable: true });
      collection.datetimeTz('continuationDueAt', { nullable: true });
      collection.datetimeTz('continuationAbandonedAt', { nullable: true });

      collection.index(['status', 'id'], { name: 'idx_lifecycle_runs_status' });
      collection.index(['lifecycle', 'recordId', 'id'], {
        name: 'idx_lifecycle_runs_record',
      });
      collection.index('continuationDueAt', {
        name: 'idx_lifecycle_runs_due',
      });
      collection.index('continuationAbandonedAt', {
        name: 'idx_lifecycle_runs_abandoned',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('lifecycleEffectRuns');
    await builder.dropCollection('lifecycleTransitions');
  },
});

export default migration;
