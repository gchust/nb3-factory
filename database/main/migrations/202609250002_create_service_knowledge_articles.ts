import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Repair knowledge. `status` separates a supervisor's draft from a published
 * article that qualified readers may open.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609250002_create_service_knowledge_articles',

  async up({ builder }) {
    await builder.createCollection('serviceKnowledgeArticles', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.string('summary', { length: 255, nullable: true });
      collection.text('content', { nullable: false });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'draft',
      });
      collection.string('tags', { length: 255, nullable: true });
      collection.string('authorId', { length: 64, nullable: true });
      collection.datetime('publishedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('serviceKnowledgeArticles');
  },
});

export default migration;
