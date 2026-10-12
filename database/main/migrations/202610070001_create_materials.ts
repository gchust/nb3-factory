import { defineMigration } from '@nocobase/db';

/**
 * The internal-materials feature's own tables.
 *
 * `materials.ownerId` is the person responsible for the material (资料负责人). `published` distinguishes a shared,
 * published material from a private draft, and `confidential` marks a material that must never leave its owner's hands
 * even if a share row exists for it.
 *
 * `materialShares` is the administrator's temporary hand-over: one row opens exactly one material to exactly one
 * reader. Revoking deletes the row.
 *
 * Every field, index and constraint is spelled out here because a migration is immutable history and must not read a
 * Collection definition that keeps evolving.
 */
const migration = defineMigration({
  name: '202610070001_create_materials',
  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.text('body').nullable();
      collection.string('ownerId', { length: 64, nullable: false });
      collection.boolean('published', { nullable: false, defaultValue: false });
      collection.boolean('confidential', {
        nullable: false,
        defaultValue: false,
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('ownerId', { name: 'idx_materials_owner' });
      collection.index('published', { name: 'idx_materials_published' });
      collection.index('confidential', { name: 'idx_materials_confidential' });
    });
    await builder.createCollection('materialShares', (collection) => {
      collection.increments('id');
      collection.integer('materialId', { nullable: false });
      collection.string('userId', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['materialId', 'userId'], {
        name: 'uq_material_shares_material_user',
      });
      collection.index('userId', { name: 'idx_material_shares_user' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('materialShares');
    await builder.dropCollection('materials');
  },
});

export default migration;
