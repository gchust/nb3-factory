import { defineMigration } from '@nocobase/db';

/**
 * Creates the two tables behind the materials feature.
 *
 * `materials` holds what a person writes: a title and an owner. `material_files`
 * is the file plugin's storage Collection, extended with the two columns the
 * plugin does not know about — `ownerId` (who uploaded it, also the isolation
 * key) and `materialId` (which material it currently belongs to, null while the
 * upload exists but the material has not been saved yet).
 *
 * Both are written out here rather than derived from a model so that this
 * migration keeps meaning what it meant when it ran. The name matches the file
 * name; `up` creates, `down` reverses in dependency order.
 */
export default defineMigration({
  name: '202609010001_create_materials',
  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.uuid('id').primary();
      collection.string('title', { length: 255, nullable: false });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('ownerId', { name: 'materials_owner_idx' });
    });

    await builder.createCollection('material_files', (collection) => {
      // The fixed columns the file plugin's upload path composes.
      collection.uuid('id').primary();
      collection.string('disk', { length: 32, nullable: false });
      collection.string('key', { length: 512, nullable: false });
      collection.string('filename', { length: 255, nullable: false });
      collection.string('ext', {
        length: 32,
        nullable: false,
        defaultValue: '',
      });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      // The two application-owned columns.
      collection.string('ownerId', { length: 64, nullable: false });
      collection.string('materialId', { length: 36, nullable: true });
      collection.index('ownerId', { name: 'material_files_owner_idx' });
      collection.index('materialId', { name: 'material_files_material_idx' });
      collection.index(['key', 'disk'], {
        name: 'material_files_key_disk_idx',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('material_files');
    await builder.dropCollection('materials');
  },
});
