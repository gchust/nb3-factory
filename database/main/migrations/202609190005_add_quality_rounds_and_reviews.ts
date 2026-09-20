import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Per-round retention for nonconformance handling.
 *
 * A rectification can be returned by the supervisor and handled again. Each
 * handling cycle is a numbered round: `nonconformances.round` is the current
 * round, `qualityAttachments.round` records which round a piece of evidence
 * belongs to, and `nonconformanceReviews` keeps every review decision so a
 * returned round's comment is not overwritten by the next one.
 *
 * `round` is non-nullable with a default of 1, so it can be added to an
 * already populated table without a separate backfill migration: existing
 * rows belong to the first round.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190005_add_quality_rounds_and_reviews',

  async up({ builder }) {
    await builder.alterCollection('nonconformances', (collection) => {
      collection.integer('round', { nullable: false, defaultValue: 1 });
    });

    await builder.alterCollection('qualityAttachments', (collection) => {
      collection.integer('round', { nullable: false, defaultValue: 1 });
    });

    await builder.createCollection('nonconformanceReviews', (collection) => {
      collection.string('id', { length: 64, nullable: false });
      collection.string('nonconformanceId', { length: 64, nullable: false });
      collection.integer('round', { nullable: false });
      collection.string('decision', { length: 32, nullable: false });
      collection.text('comment', { nullable: true });
      collection.string('reviewedById', { length: 64, nullable: false });
      collection.datetime('reviewedAt', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.primary('id');
      collection.index('nonconformanceId');
      collection.index(['nonconformanceId', 'round']);
    });
  },

  async down({ builder }) {
    await builder.dropCollection('nonconformanceReviews');
    await builder.alterCollection('qualityAttachments', (collection) => {
      collection.dropField('round');
    });
    await builder.alterCollection('nonconformances', (collection) => {
      collection.dropField('round');
    });
  },
});

export default migration;
