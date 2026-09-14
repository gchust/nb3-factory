import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Recruiting & interview management schema.
 *
 * Self-contained by design: every field, index and constraint is written out here rather than imported from an
 * evolving runtime definition, so an already-applied migration keeps meaning what it meant when it ran.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609100001_create_recruiting_tables',

  async up({ builder }) {
    await builder.createCollection('recruitingRequisitions', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.string('department', { length: 255, nullable: false });
      collection.integer('headcount', { nullable: false });
      collection.text('requirements', { nullable: true });
      collection.date('expectedArrivalDate', { nullable: true });
      collection.string('priority', { length: 16, nullable: false });
      collection.string('status', { length: 16, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('status');
      collection.index('priority');
    });

    await builder.createCollection('recruitingCandidates', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('phone', { length: 32, nullable: true });
      collection.string('email', { length: 255, nullable: true });
      collection.integer('requisitionId', { nullable: true });
      collection.string('source', { length: 32, nullable: false });
      collection.string('stage', { length: 32, nullable: false });
      collection.decimal('overallScore', {
        precision: 5,
        scale: 2,
        nullable: true,
      });
      collection.string('resumeFileId', { length: 64, nullable: true });
      collection.string('resumeFilename', { length: 255, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('requisitionId');
      collection.index('stage');
      collection.index('email');
    });

    await builder.createCollection('recruitingInterviews', (collection) => {
      collection.increments('id');
      collection.integer('candidateId', { nullable: false });
      collection.string('round', { length: 16, nullable: false });
      collection.datetime('scheduledAt', { nullable: false });
      collection.string('interviewerId', { length: 64, nullable: true });
      collection.string('locationOrLink', { length: 512, nullable: true });
      collection.string('status', { length: 16, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('candidateId');
      collection.index('interviewerId');
      collection.index('status');
    });

    await builder.createCollection('recruitingEvaluations', (collection) => {
      collection.increments('id');
      collection.integer('interviewId', { nullable: false });
      collection.integer('technicalScore', { nullable: false });
      collection.integer('communicationScore', { nullable: false });
      collection.string('conclusion', { length: 16, nullable: false });
      collection.text('comments', { nullable: true });
      collection.string('createdById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('interviewId');
    });

    await builder.createCollection('recruitingOffers', (collection) => {
      collection.increments('id');
      collection.integer('candidateId', { nullable: false });
      collection.string('position', { length: 255, nullable: false });
      collection.decimal('salary', { precision: 12, scale: 2, nullable: true });
      collection.date('expectedStartDate', { nullable: true });
      collection.string('status', { length: 16, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      // A candidate may hold at most one offer record. This is the database-level guarantee behind the
      // "duplicate offer is rejected" rule; the service returns a readable message for the conflict.
      collection.unique('candidateId');
      collection.index('status');
    });

    // File metadata for resume attachments, owned by this application. Field shape is fixed by the file
    // repository contract: uuid primary key, disk/key/filename/ext/mimeType/size and timestamps.
    await builder.createCollection('recruitingResumes', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
  },

  async down({ builder }) {
    // Reverse order so nothing references a table that is dropped first.
    await builder.dropCollection('recruitingResumes');
    await builder.dropCollection('recruitingOffers');
    await builder.dropCollection('recruitingEvaluations');
    await builder.dropCollection('recruitingInterviews');
    await builder.dropCollection('recruitingCandidates');
    await builder.dropCollection('recruitingRequisitions');
  },
});

export default migration;
