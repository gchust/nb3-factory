import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Project materials and their private attachments.
 *
 * `project_materials` holds the business record: a required title and the user
 * who owns it. Isolated visibility is a property of `createdById`, which every
 * application route filters on; it is not a role or a relationship.
 *
 * `project_material_files` is a File Repository collection (the plugin owns no
 * schema of its own). It carries the fixed file columns the repository
 * validates plus two application columns:
 *
 * - `createdById` records the uploader, so a content request can be checked
 *   against the caller without joining through the material. It is stamped
 *   server-side by the upload policy and is never accepted from the browser.
 * - `materialId` is the link to the owning material. It is nullable on purpose:
 *   an upload happens before the material is saved, so a file exists unattached
 *   until the form is submitted and the service links it.
 *
 * `seedKey` is a stable natural key for the two demonstration materials the
 * Seed installs. It exists so re-running the seed can recognize a row it
 * already created without overwriting a title the user may have edited; a
 * material created in the application leaves it null.
 *
 * The Collection names are the physical table names — this database package
 * dropped `tableName` aliases — and every field, index and constraint is
 * written out here rather than imported from a definition that keeps evolving.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610200001_create_project_materials',
  async up({ builder }) {
    await builder.createCollection('project_materials', (collection) => {
      collection.increments('id');
      collection
        .string('seedKey', { length: 64 })
        .nullable()
        .unique({ name: 'uq_project_materials_seed_key' });
      collection.string('title', { length: 255 }).notNull();
      collection.string('createdById', { length: 64 }).notNull().index({
        name: 'ix_project_materials_created_by_id',
      });
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    await builder.createCollection('project_material_files', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.string('createdById', { length: 64 }).notNull().index({
        name: 'ix_project_material_files_created_by_id',
      });
      collection.integer('materialId').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.foreignKey('materialId', {
        name: 'fk_project_material_files_material_id',
        references: { collection: 'project_materials', fields: ['id'] },
        // Deleting a material detaches its files rather than destroying them,
        // which matches how removing one attachment behaves: neither action
        // touches the stored object.
        onDelete: 'set null',
        onUpdate: 'cascade',
      });
      collection.index('materialId', {
        name: 'ix_project_material_files_material_id',
      });
    });
  },
  async down({ builder }) {
    // Reverse creation order: the file table's foreign key references the
    // material table, so the referencing table goes first.
    await builder.dropCollection('project_material_files');
    await builder.dropCollection('project_materials');
  },
});

export default migration;
