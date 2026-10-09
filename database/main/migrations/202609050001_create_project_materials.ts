import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// A material is the archivist's own record: a required title, an optional description, and the files attached to it.
// `createdById` is the Better Auth user id and is the single column every owner-scoped read and write filters on, so
// it is indexed. The table is self-contained: this migration spells out every field and index it needs rather than
// importing a collection definition that keeps evolving.
const migration: MigrationDefinition = defineMigration({
  name: '202609050001_create_project_materials',
  async up({ builder }) {
    await builder.createCollection('projectMaterials', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('title', { length: 200 }).notNull();
      collection.text('description').nullable();
      collection.string('createdById', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('createdById', {
        name: 'idx_project_materials_created_by',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('projectMaterials');
  },
});

export default migration;
