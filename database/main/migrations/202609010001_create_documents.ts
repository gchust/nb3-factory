import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609010001_create_documents',

  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.uuid('id').primary();
      collection.string('title', { length: 255, nullable: false });
      collection.text('body', { nullable: false });
      collection.string('ownerId', { length: 255, nullable: false });
      collection.boolean('published', { nullable: false, defaultValue: false });
      collection.boolean('confidential', {
        nullable: false,
        defaultValue: false,
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('ownerId', { name: 'idx_documents_owner' });
      collection.index(['published', 'confidential'], {
        name: 'idx_documents_visibility',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('documents');
  },
});

export default migration;
