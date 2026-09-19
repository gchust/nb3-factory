import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Recruitment and onboarding schema.
 *
 * Positions, candidates, interviews and onboarding todos are owned by this
 * application. Person references are stored as the account's username so that
 * the demo data seed stays independent of account identifiers; the runtime
 * resolves the signed-in account from the authentication session and compares
 * usernames.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190001_create_recruitment_tables',

  async up({ builder }) {
    await builder.createCollection('recruitmentPositions', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 128 }).notNull();
      collection.string('department', { length: 64 }).notNull();
      collection.integer('headcount').notNull();
      collection.string('ownerUsername', { length: 64 }).notNull();
      collection.string('ownerName', { length: 64 }).nullable();
      collection.string('status', { length: 16 }).notNull().defaultTo('open');
      collection.text('description').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id');
      collection.index('department');
      collection.index('status');
    });

    await builder.createCollection('recruitmentCandidates', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 64 }).notNull();
      collection.string('phone', { length: 32 }).nullable();
      collection.string('email', { length: 128 }).nullable();
      collection.string('positionId', { length: 64 }).notNull();
      collection.string('recruiterUsername', { length: 64 }).notNull();
      collection.string('recruiterName', { length: 64 }).nullable();
      collection.string('stage', { length: 24 }).notNull().defaultTo('pending');
      collection.string('source', { length: 32 }).nullable();
      collection.text('note').nullable();
      collection.string('hireConfirmedBy', { length: 64 }).nullable();
      collection.datetime('hireConfirmedAt').nullable();
      collection.datetime('offeredAt').nullable();
      collection.datetime('onboardedAt').nullable();
      collection.string('rejectedBy', { length: 64 }).nullable();
      collection.text('rejectionReason').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id');
      collection.index('positionId');
      collection.index('recruiterUsername');
      collection.index('stage');
    });

    await builder.createCollection('recruitmentInterviews', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('candidateId', { length: 64 }).notNull();
      collection.string('positionId', { length: 64 }).notNull();
      collection.string('interviewerUsername', { length: 64 }).notNull();
      collection.string('interviewerName', { length: 64 }).nullable();
      collection.datetime('scheduledAt').notNull();
      collection.string('method', { length: 16 }).notNull().defaultTo('onsite');
      collection
        .string('status', { length: 16 })
        .notNull()
        .defaultTo('scheduled');
      collection.string('result', { length: 16 }).nullable();
      collection.integer('score').nullable();
      collection.text('evaluation').nullable();
      collection.datetime('completedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id');
      collection.index('candidateId');
      collection.index('interviewerUsername');
      collection.index('scheduledAt');
      collection.index('status');
    });

    await builder.createCollection(
      'recruitmentOnboardingTodos',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('candidateId', { length: 64 }).notNull();
        collection.string('title', { length: 128 }).notNull();
        collection
          .string('status', { length: 16 })
          .notNull()
          .defaultTo('pending');
        collection.datetime('dueAt').nullable();
        collection.datetime('completedAt').nullable();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.primary('id');
        collection.index('candidateId');
        collection.index('status');
      },
    );
  },

  async down({ builder }) {
    // Reverse in dependency order: todos and interviews reference candidates.
    await builder.dropCollection('recruitmentOnboardingTodos');
    await builder.dropCollection('recruitmentInterviews');
    await builder.dropCollection('recruitmentCandidates');
    await builder.dropCollection('recruitmentPositions');
  },
});

export default migration;
