import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/** Knowledge base and file attachment collections. */
const migration: MigrationDefinition = defineMigration({
  name: '202609220103_create_service_knowledge_and_files',

  async up({ builder }) {
    await builder.createCollection('serviceKnowledge', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200, nullable: false });
      collection.string('deviceCategory', { length: 64 });
      collection.text('summary');
      collection.text('body');
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'draft',
      });
      collection.string('authorId', { length: 64 });
      collection.integer('viewCount', { nullable: false, defaultValue: 0 });
      collection.datetime('publishedAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('status');
      collection.index('deviceCategory');
    });

    // File collection, fixed field mapping owned by the File plugin.
    await builder.createCollection('serviceFiles', (collection) => {
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

    await builder.createCollection('serviceKnowledgeFiles', (collection) => {
      collection.increments('id');
      collection.integer('knowledgeId', { nullable: false });
      collection.uuid('fileId', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.unique(['knowledgeId', 'fileId']);
      collection.index('fileId');
    });

    await builder.createCollection('serviceTicketFiles', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.uuid('fileId', { nullable: false });
      collection.string('category', {
        length: 32,
        nullable: false,
        defaultValue: 'attachment',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.unique(['ticketId', 'fileId']);
      collection.index('fileId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('serviceTicketFiles');
    await builder.dropCollection('serviceKnowledgeFiles');
    await builder.dropCollection('serviceFiles');
    await builder.dropCollection('serviceKnowledge');
  },
});

export default migration;
