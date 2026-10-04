import { defineMigration } from '@nocobase/db';

/**
 * The document library's only table. It is created here rather than declared in a Collection file so the physical
 * schema has one self-contained, immutable history: every field, index and constraint this application needs is
 * spelled out below and never re-read from an evolving definition.
 *
 * `id` is a caller-supplied string key rather than an auto-increment so seeds can write deterministic rows, and
 * `ownerId` shares the `user` table's `varchar(64)` shape so an owner can be compared to a session user id without
 * casting.
 */
const migration = defineMigration({
  name: '202610040001_create_materials',
  async up({ builder }) {
    await builder.createCollection(
      'materials',
      (collection) => {
        collection.title('资料');
        collection.string('id', { length: 64 }).notNull();
        collection.string('title', { length: 255 }).notNull().title('标题');
        collection.text('body').nullable().title('正文');
        collection.string('ownerId', { length: 64 }).notNull().title('负责人');
        collection
          .boolean('published')
          .notNull()
          .defaultTo(false)
          .title('是否发布');
        collection
          .boolean('confidential')
          .notNull()
          .defaultTo(false)
          .title('是否保密');
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.primary('id', { name: 'pk_materials' });
        collection.index('ownerId', { name: 'idx_materials_owner' });
        collection.index('published', { name: 'idx_materials_published' });
      },
      { title: '资料' },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('materials');
  },
});

export default migration;
