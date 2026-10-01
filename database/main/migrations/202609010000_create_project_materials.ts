import { defineMigration } from '@nocobase/db';

/**
 * Project materials (资料) and their attachments.
 *
 * Two tables:
 *
 * - `projectMaterials` — a titled material record owned by the user who created it.
 * - `projectMaterialFiles` — one row per stored attachment. The byte-level columns (`disk`, `key`,
 *   `filename`, `ext`, `mimeType`, `size`) are the ones the file plugin's repository policy allows
 *   through `FILE_COLUMNS`, so the stock upload path can write a row here. `ownerId` is an
 *   application-owned column used to scope reads and writes to a single contributor.
 *
 * A file is linked to a material through `materialId`; removing an attachment on save clears that
 * link rather than deleting the row, matching the requirement that there is no recycle bin and no
 * hard delete.
 */
const migration = defineMigration({
  name: '202609010000_create_project_materials',
  async up({ builder }) {
    await builder.createCollection('projectMaterials', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.primary('id');
      collection.string('title', { length: 255 }).notNull();
      collection.string('createdById', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('createdById');
    });

    await builder.createCollection('projectMaterialFiles', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.primary('id');
      collection.string('disk', { length: 32 }).notNull();
      collection.string('key', { length: 255 }).notNull();
      collection.string('filename', { length: 255 }).notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 128 }).notNull();
      collection.integer('size').notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('materialId', { length: 64 });
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('ownerId');
      collection.index('materialId');
      collection.index('key');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('projectMaterialFiles');
    await builder.dropCollection('projectMaterials');
  },
});

export default migration;
