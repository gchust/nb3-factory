import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Training and homework grading schema.
 *
 * Self-contained by design: every field, index, and constraint is spelled out
 * here instead of imported from runtime code, so an already-applied migration
 * never changes meaning.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190001_create_training_tables',

  async up({ builder }) {
    await builder.createCollection('trainingCourses', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('description').nullable();
      collection.string('category', { length: 64 }).notNull();
      collection.string('level', { length: 32 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('code', { name: 'uq_training_courses_code' });
      collection.index('category', { name: 'idx_training_courses_category' });
      collection.index('status', { name: 'idx_training_courses_status' });
    });

    await builder.createCollection('trainingSessions', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull();
      collection.integer('courseId').notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.string('instructorId', { length: 64 }).notNull();
      collection.datetime('startAt').notNull();
      collection.datetime('endAt').notNull();
      collection.integer('capacity').notNull().defaultTo(30);
      collection.string('location', { length: 255 }).nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('code', { name: 'uq_training_sessions_code' });
      collection.index('courseId', { name: 'idx_training_sessions_course' });
      collection.index('instructorId', {
        name: 'idx_training_sessions_instructor',
      });
      collection.index('status', { name: 'idx_training_sessions_status' });
    });

    await builder.createCollection('trainingEnrollments', (collection) => {
      collection.increments('id');
      collection.integer('sessionId').notNull();
      collection.string('studentId', { length: 64 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.datetime('enrolledAt').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['sessionId', 'studentId'], {
        name: 'uq_training_enrollments_session_student',
      });
      collection.index('studentId', {
        name: 'idx_training_enrollments_student',
      });
      collection.index('status', { name: 'idx_training_enrollments_status' });
    });

    await builder.createCollection('trainingAssignments', (collection) => {
      collection.increments('id');
      collection.integer('sessionId').notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('description').nullable();
      collection.datetime('dueAt').notNull();
      collection.integer('maxScore').notNull().defaultTo(100);
      collection.string('status', { length: 32 }).notNull();
      collection.datetime('publishedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('sessionId', {
        name: 'idx_training_assignments_session',
      });
      collection.index('status', { name: 'idx_training_assignments_status' });
      collection.index('dueAt', { name: 'idx_training_assignments_due' });
    });

    await builder.createCollection('trainingSubmissions', (collection) => {
      collection.increments('id');
      collection.integer('assignmentId').notNull();
      collection.string('studentId', { length: 64 }).notNull();
      collection.integer('attempt').notNull().defaultTo(1);
      collection.text('content').notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.boolean('isLate').notNull().defaultTo(false);
      collection.datetime('submittedAt').notNull();
      collection.integer('score').nullable();
      collection.text('feedback').nullable();
      collection.string('reviewedById', { length: 64 }).nullable();
      collection.datetime('reviewedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['assignmentId', 'studentId', 'attempt'], {
        name: 'uq_training_submissions_assignment_student_attempt',
      });
      collection.index('studentId', {
        name: 'idx_training_submissions_student',
      });
      collection.index('status', { name: 'idx_training_submissions_status' });
    });

    await builder.createCollection(
      'trainingSubmissionReviews',
      (collection) => {
        collection.increments('id');
        collection.integer('submissionId').notNull();
        collection.integer('attempt').notNull();
        collection.string('decision', { length: 32 }).notNull();
        collection.integer('score').nullable();
        collection.text('feedback').notNull();
        collection.string('reviewerId', { length: 64 }).notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.index('submissionId', {
          name: 'idx_training_submission_reviews_submission',
        });
      },
    );
  },

  async down({ builder }) {
    await builder.dropCollection('trainingSubmissionReviews');
    await builder.dropCollection('trainingSubmissions');
    await builder.dropCollection('trainingAssignments');
    await builder.dropCollection('trainingEnrollments');
    await builder.dropCollection('trainingSessions');
    await builder.dropCollection('trainingCourses');
  },
});

export default migration;
