import {
  defineMigration,
  type MigrationDefinition,
} from '@nocobase/db';

// A project material is one record a maintainer owns: a required title plus a
// set of attachments. Ownership is expressed with `createdById` instead of an
// Authorization grant because the requirement is per-record ownership, which is
// cheaper to enforce directly in the application's own routes.
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_create_project_materials',
  async up({ builder }) {
    await builder.createCollection('projectMaterials', (collection) => {
      collection.uuid('id').notNull();
      collection.string('title', { length: 255 }).notNull();
      // The signed-in user id that owns this material. Kept as a plain column so
      // this migration stays self-contained and does not depend on the
      // Authentication plugin's evolving table definition.
      collection.string('createdById', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_project_materials' });
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