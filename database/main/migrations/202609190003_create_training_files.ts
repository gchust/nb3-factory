import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Course material and homework attachment schema.
 *
 * Three link tables keep the three business groups apart: lesson courseware,
 * a student's homework attachments, and the instructor's reviewed annotation.
 * `trainingFiles` is the File Repository collection: its columns match the File
 * Repository contract, and `uploadedById` records who uploaded it so a file is
 * always readable by its uploader and by anyone with access to the record it is
 * later attached to.
 *
 * Self-contained by design: every field, index and constraint is spelled out
 * here instead of imported from runtime code.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190003_create_training_files',

  async up({ builder }) {
    await builder.createCollection('trainingFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      // The upload path stamps the uploader through the exposure Policy, so the
      // column carries a default for the Repository's own insert.
      collection.string('uploadedById', { length: 64 }).notNull().defaultTo('');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('uploadedById', {
        name: 'idx_training_files_uploader',
      });
    });

    await builder.createCollection('trainingMaterials', (collection) => {
      collection.increments('id');
      collection.integer('sessionId').notNull();
      collection.string('fileId', { length: 36 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.string('uploadedById', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('sessionId', {
        name: 'idx_training_materials_session',
      });
      collection.index('fileId', { name: 'idx_training_materials_file' });
    });

    await builder.createCollection('trainingSubmissionFiles', (collection) => {
      collection.increments('id');
      collection.integer('submissionId').notNull();
      collection.string('fileId', { length: 36 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('submissionId', {
        name: 'idx_training_submission_files_submission',
      });
      collection.index('fileId', {
        name: 'idx_training_submission_files_file',
      });
    });

    await builder.createCollection('trainingReviewFiles', (collection) => {
      collection.increments('id');
      collection.integer('reviewId').notNull();
      collection.string('fileId', { length: 36 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('reviewId', {
        name: 'idx_training_review_files_review',
      });
      collection.index('fileId', { name: 'idx_training_review_files_file' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('trainingReviewFiles');
    await builder.dropCollection('trainingSubmissionFiles');
    await builder.dropCollection('trainingMaterials');
    await builder.dropCollection('trainingFiles');
  },
});

export default migration;
