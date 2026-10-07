import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The source document a supervisor uploads for one device manual.
 *
 * `deviceManuals` already carries the catalogue metadata and the processing
 * status. These three columns carry the uploaded document itself — a Markdown
 * (or plain-text) file small enough to keep beside its record — so the
 * application can serve it back through its own authorized route and report a
 * status that reflects what actually happened to the file.
 *
 * `content` holds the decoded text, not bytes: the acceptance workflow uploads
 * Markdown manuals, which are text, and a text column keeps the document
 * readable and searchable without the File plugin.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010005_add_manual_document',

  async up({ builder }) {
    await builder.alterCollection('deviceManuals', (collection) => {
      collection.text('content').nullable();
      // text/markdown for the documents this workflow uploads.
      collection.string('contentType', { length: 64 }).nullable();
      collection.integer('contentSize').nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('deviceManuals', (collection) => {
      collection.dropFields('contentSize', 'contentType', 'content');
    });
  },
});

export default migration;
