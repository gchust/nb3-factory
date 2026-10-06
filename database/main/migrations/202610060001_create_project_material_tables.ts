import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The tables behind "项目资料" (Project Materials) and its private attachments.
 *
 * `createdById` is the owner: both tables are row-scoped by it, so material
 * isolation is enforced by the application queries even though no foreign key
 * points at a user. It is a plain string because the `user` table belongs to
 * Better Auth and is not a NocoBase Collection; the value is a Better Auth
 * user id, like the ids in `projectMaterials`.
 *
 * The attachment columns are exactly the ones `@nocobase/app-plugin-file`
 * requires of a file Collection (see its `validateCollection`): `id` must be
 * the sole UUID primary key, and disk/key/filename/ext/mimeType/size plus the
 * two timestamps must exist with compatible types. `materialId` is null while
 * an upload is still a draft, and is set when the owning material is saved.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610060001_create_project_material_tables',

  async up({ builder }) {
    await builder.createCollection('projectMaterials', (collection) => {
      collection.uuid('id').primary();
      collection.string('title', { length: 255, nullable: false });
      collection.string('createdById', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('createdById');
    });

    await builder.createCollection(
      'projectMaterialAttachments',
      (collection) => {
        collection.uuid('id').primary();
        collection.string('disk', { length: 64, nullable: false });
        collection.string('key', { length: 512, nullable: false });
        collection.string('filename', { length: 512, nullable: false });
        collection.string('ext', { length: 32, nullable: false });
        collection.string('mimeType', { length: 255, nullable: false });
        collection.bigInt('size', { nullable: false });
        collection.string('createdById', { length: 64, nullable: false });
        collection.uuid('materialId', { nullable: true });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.index('createdById');
        collection.index('materialId');
        collection.foreignKey('materialId', {
          references: { collection: 'projectMaterials', fields: ['id'] },
          name: 'fk_project_material_attachments_material',
          onDelete: 'set null',
        });
      },
    );
  },

  async down({ builder }) {
    // Attachments first: they carry the foreign key into materials.
    await builder.dropCollection('projectMaterialAttachments');
    await builder.dropCollection('projectMaterials');
  },
});

export default migration;
