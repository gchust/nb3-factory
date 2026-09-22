import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Execution history for scheduled/controlled background jobs. The inspection
 * schedule appends one row per run so a business administrator can see the
 * actual result and any failure reason without treating "triggered" as
 * "completed". Rows are append-only: a retry adds history instead of erasing
 * the previous attempt.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609220105_create_service_job_runs',

  async up({ builder }) {
    await builder.createCollection('serviceJobRuns', (collection) => {
      collection.increments('id');
      collection.string('kind', { length: 32, nullable: false });
      collection.integer('referenceId');
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'succeeded',
      });
      collection.json('result');
      collection.text('error');
      collection.string('triggeredBy', {
        length: 64,
        nullable: false,
        defaultValue: 'schedule',
      });
      collection.datetime('startedAt', { nullable: false });
      collection.datetime('finishedAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('kind');
      collection.index('referenceId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('serviceJobRuns');
  },
});

export default migration;
