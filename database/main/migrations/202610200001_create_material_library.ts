import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the three tables behind the internal document library (资料库):
 *
 * - `materials` — one row per material: title, body, owner, and the two flags that decide who may read it.
 * - `materialShares` — a temporary, per-record read grant an administrator gives one person for one material.
 * - `libraryMemberRoles` — the work role that decides whether a person may create materials (`editor`) or only read
 *   the ones already published and shared with them (`reader`).
 *
 * The shape is spelled out here rather than imported, so a later change to the library code cannot change what this
 * migration already applied. Add fields in a new migration.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610200001_create_material_library',

  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      // Material ids are strings, like every other id the API exposes.
      collection.string('id', { length: 36 }).notNull();
      // A stable, non-editable key. The installation seed finds its three materials by it, so re-running the seed
      // after a person edited a title neither duplicates the record nor overwrites their edit.
      collection.string('reference', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').nullable();
      // The Better Auth `user.id`, a UUID string. A plain column rather than a relation: the authentication plugin
      // owns the user table and the library must not depend on its internal schema.
      collection.string('ownerId', { length: 64 }).notNull();
      // A published, non-confidential material is readable by every library member.
      collection.boolean('published').notNull().defaultTo(false);
      // A confidential material stays with its owner and administrators, even when it is shared.
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_materials' });
      collection.unique('reference', { name: 'uq_materials_reference' });
      collection.index('ownerId', { name: 'idx_materials_owner' });
      collection.index('published', { name: 'idx_materials_published' });
      collection.index('confidential', { name: 'idx_materials_confidential' });
    });

    await builder.createCollection('materialShares', (collection) => {
      collection.increments('id');
      collection.string('materialId', { length: 36 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.string('grantedById', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();

      collection.unique(['materialId', 'userId'], {
        name: 'uq_material_shares_material_user',
      });
      collection.index('userId', { name: 'idx_material_shares_user' });
    });

    await builder.createCollection('libraryMemberRoles', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64 }).notNull();
      collection.string('role', { length: 32 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.unique('userId', { name: 'uq_library_member_roles_user' });
    });
  },

  async down({ builder }) {
    // Reverse dependency order: the shares point at a material, the roles stand alone.
    await builder.dropCollection('materialShares');
    await builder.dropCollection('libraryMemberRoles');
    await builder.dropCollection('materials');
  },
});

export default migration;
