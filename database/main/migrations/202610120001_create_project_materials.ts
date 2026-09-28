import { defineMigration } from '@nocobase/db';

/**
 * A material is only a title plus the attachments that belong to it, and it
 * belongs to exactly one owner. The owner column is what keeps one person's
 * materials out of another person's reach, so it is indexed and never nullable.
 */
export default defineMigration({
  name: '202610120001_create_project_materials',
  async up({ builder }) {
    await builder.createCollection('project_materials', (collection) => {
      collection.uuid('id').notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_project_materials' });
      collection.index('ownerId', { name: 'idx_project_materials_owner' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('project_materials');
  },
});
