import { defineMigration, type MigrationDefinition } from '@nocobase/db';

export const createDocumentsMigration: MigrationDefinition = defineMigration({
  name: '202610060001_create_documents',
  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200, nullable: false });
      collection.text('body', { nullable: false });
      // `accessLevel` is access metadata, not document content: it decides who may read the row.
      // The maintained content stays title + body; the documents page never edits this field.
      collection.string('accessLevel', {
        length: 32,
        nullable: false,
        defaultValue: 'staff',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('title', { name: 'uq_documents_title' });
      collection.index('accessLevel', { name: 'idx_documents_access_level' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('documents');
  },
});

export default createDocumentsMigration;
