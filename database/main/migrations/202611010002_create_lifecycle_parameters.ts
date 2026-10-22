import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Storage for the lifecycle parameter adapter. The helpdesk lifecycle declares
 * an administrator-owned reminder group, and the runtime refuses to register
 * such a definition without a parameter store. These tables follow the
 * contract of `StoredLifecycleParameters` in the installed
 * `@nocobase/lifecycle`: identity strings are hashes, current heads are
 * separate from immutable versions, and reviewer selections and usage facts
 * have their own rows.
 *
 * A later change to that package needs an alteration migration rather than an
 * edit to this file.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010002_create_lifecycle_parameters',

  async up({ builder }) {
    await builder.createCollection('lifecycleParameterHeads', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('scope', { length: 191 }).notNull();
      collection.string('groupKey', { length: 191 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.integer('revision').notNull();

      collection.primary('id', { name: 'pk_lifecycle_parameter_heads' });
      collection.index(['scope', 'groupKey'], {
        name: 'idx_lifecycle_parameter_heads_scope',
      });
    });

    await builder.createCollection(
      'lifecycleParameterVersions',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.json('payload').notNull();
        collection.json('selectionCounts').notNull();

        collection.primary('id', {
          name: 'pk_lifecycle_parameter_versions',
        });
      },
    );

    await builder.createCollection(
      'lifecycleParameterSelections',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('versionId', { length: 64 }).notNull();
        collection.string('ruleKey', { length: 191 }).notNull();
        collection.integer('group').notNull();
        collection.string('type', { length: 64 }).notNull();
        collection.string('referenceId', { length: 191 }).notNull();

        collection.primary('id', {
          name: 'pk_lifecycle_parameter_selections',
        });
        collection.index('versionId', {
          name: 'idx_lifecycle_parameter_selections_version',
        });
      },
    );

    await builder.createCollection(
      'lifecycleParameterRequests',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('actorId', { length: 64 }).notNull();
        collection.string('fingerprint', { length: 64 }).notNull();
        collection.integer('revision').notNull();

        collection.primary('id', {
          name: 'pk_lifecycle_parameter_requests',
        });
      },
    );

    await builder.createCollection(
      'lifecycleParameterSnapshots',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.json('payload').notNull();

        collection.primary('id', {
          name: 'pk_lifecycle_parameter_snapshots',
        });
      },
    );

    await builder.createCollection('lifecycleParameterUsages', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('recordKey', { length: 64 }).notNull();
      collection.json('payload').notNull();
      collection.datetimeTz('at').notNull();

      collection.primary('id', { name: 'pk_lifecycle_parameter_usages' });
      collection.index(['recordKey', 'at'], {
        name: 'idx_lifecycle_parameter_usages_record',
      });
    });
  },

  async down({ builder }) {
    for (const name of [
      'lifecycleParameterUsages',
      'lifecycleParameterSnapshots',
      'lifecycleParameterRequests',
      'lifecycleParameterSelections',
      'lifecycleParameterVersions',
      'lifecycleParameterHeads',
    ]) {
      await builder.dropCollection(name);
    }
  },
});

export default migration;
