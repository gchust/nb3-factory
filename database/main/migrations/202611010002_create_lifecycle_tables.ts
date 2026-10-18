import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the two log tables `@nocobase/lifecycle`'s `RepositoryLifecycleStore` reads and writes. The library
 * ships no schema helper, so the shape is spelled out here from its contract and must not import anything that
 * keeps changing.
 *
 * `lifecycleTransitions` is the audit trail: one row per fired transition (and per creation, whose `from` is
 * null). The two unique indexes on `(lifecycle, recordId, version)` and `(lifecycle, recordId, requestKey)` are
 * what make a repeated submission fire once and two transitions that leave the state unchanged conflict.
 *
 * `lifecycleEffectRuns` is one row per owed effect, written in the transition's transaction. `continuation` holds
 * a pending `onSuccess`/`onFailure` as JSON; `continuationDueAt` mirrors its `dueAt` as a timestamp that is null
 * exactly when nothing waits, and `continuationAbandonedAt` is set once the sweep gives up on it, so both are
 * queried without filtering on JSON.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010002_create_lifecycle_tables',

  async up({ builder }) {
    await builder.createCollection('lifecycleTransitions', (collection) => {
      collection.increments('id');
      collection.string('lifecycle', { length: 64 }).notNull();
      collection.string('recordId', { length: 64 }).notNull();
      collection.string('transition', { length: 128 }).notNull();
      collection.string('from', { length: 64 }).nullable();
      collection.string('to', { length: 64 }).notNull();
      collection.string('actorId', { length: 64 }).notNull();
      collection.json('input').notNull();
      collection.datetimeTz('at').notNull();
      collection.integer('version').notNull();
      collection.string('requestId', { length: 191 }).nullable();
      collection.string('requestKey', { length: 191 }).notNull();

      collection.unique(['lifecycle', 'recordId', 'version'], {
        name: 'uq_lifecycle_transitions_version',
      });
      collection.unique(['lifecycle', 'recordId', 'requestKey'], {
        name: 'uq_lifecycle_transitions_request',
      });
    });

    await builder.createCollection('lifecycleEffectRuns', (collection) => {
      collection.increments('id');
      // A number, not a string: the library writes `transitionId` with its own `key()` helper
      // (a JavaScript number for a numeric id) and reads it back with `String()`.
      collection.integer('transitionId').notNull();
      collection.string('lifecycle', { length: 64 }).notNull();
      collection.string('recordId', { length: 64 }).notNull();
      collection.string('effect', { length: 128 }).notNull();
      collection.boolean('stayBound').notNull();
      collection.string('status', { length: 16 }).notNull();
      collection.integer('attempts').notNull();
      collection.integer('maxAttempts').notNull();
      collection.json('result').nullable();
      collection.text('error').nullable();
      collection.datetimeTz('createdAt').notNull();
      collection.datetimeTz('updatedAt').notNull();
      collection.datetimeTz('claimedAt').nullable();
      collection.datetimeTz('runAfter').nullable();
      collection.json('continuation').nullable();
      collection.datetimeTz('continuationDueAt').nullable();
      collection.datetimeTz('continuationAbandonedAt').nullable();

      collection.index(['lifecycle', 'recordId'], {
        name: 'idx_lifecycle_effect_runs_record',
      });
      collection.index('status', { name: 'idx_lifecycle_effect_runs_status' });
      collection.index('claimedAt', {
        name: 'idx_lifecycle_effect_runs_claimed',
      });
      collection.index('continuationDueAt', {
        name: 'idx_lifecycle_effect_runs_continuation',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('lifecycleEffectRuns');
    await builder.dropCollection('lifecycleTransitions');
  },
});

export default migration;
