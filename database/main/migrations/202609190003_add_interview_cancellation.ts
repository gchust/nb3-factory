import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Interview cancellation.
 *
 * Cancelling an interview keeps the row (it is history, and a scheduling error
 * must stay auditable) but moves its status to `cancelled`. The two added
 * columns record who cancelled it and when.
 *
 * Cancellation is deliberately a separate migration from
 * `202609190002_create_recruitment_candidate_files` because that migration has
 * already been applied on environments built from this branch; history is
 * append-only.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190003_add_interview_cancellation',

  async up({ builder }) {
    await builder.alterCollection('recruitmentInterviews', (collection) => {
      collection.string('cancelledBy', { length: 64 }).nullable();
      collection.datetime('cancelledAt').nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('recruitmentInterviews', (collection) => {
      collection.dropField('cancelledBy');
      collection.dropField('cancelledAt');
    });
  },
});

export default migration;
