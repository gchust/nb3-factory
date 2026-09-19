import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Candidate attachments: resumes, portfolio works and offer materials.
 *
 * The collection carries the fixed file columns `@nocobase/app-plugin-file`
 * requires plus nullable business columns. The upload endpoint only writes the
 * file columns; the recruitment link endpoint stamps the business columns once
 * the caller is authorized for the candidate, so an uploaded object is invisible
 * until it is linked. Resume versions are kept by superseding the previous
 * active row instead of deleting it, and interviews remember which resume
 * version was current when they were scheduled.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190002_create_recruitment_candidate_files',

  async up({ builder }) {
    await builder.createCollection(
      'recruitmentCandidateFiles',
      (collection) => {
        // Fixed File Repository columns. `id` must hold a 36-character UUID.
        collection.string('id', { length: 64 }).notNull();
        collection.string('disk', { length: 255 }).notNull();
        collection.text('key').notNull();
        collection.text('filename').notNull();
        collection.string('ext', { length: 32 }).notNull();
        collection.string('mimeType', { length: 255 }).notNull();
        collection.bigInt('size').notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        // Application-owned association columns.
        collection.string('candidateId', { length: 64 }).nullable();
        collection.string('category', { length: 16 }).nullable();
        collection.string('uploadedByUsername', { length: 64 }).nullable();
        collection.string('uploadedByName', { length: 64 }).nullable();
        collection.integer('version').nullable();
        collection.integer('superseded').notNull().defaultTo(0);
        collection.datetime('supersededAt').nullable();
        collection.primary('id');
        collection.index('candidateId');
        collection.index('category');
      },
    );

    await builder.alterCollection('recruitmentInterviews', (collection) => {
      collection.string('resumeFileId', { length: 64 }).nullable();
      collection.integer('resumeVersion').nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('recruitmentInterviews', (collection) => {
      collection.dropField('resumeFileId');
      collection.dropField('resumeVersion');
    });
    await builder.dropCollection('recruitmentCandidateFiles');
  },
});

export default migration;
