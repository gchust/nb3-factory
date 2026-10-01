import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Materials are the only business records of this application: a title and a
 * body. `confidential` is authorization infrastructure rather than user-facing
 * content — it marks the material a supervisor manages but an ordinary
 * colleague must not read. It is set by the administrator/seed and is never
 * offered in the edit form.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609290001_create_materials',
  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.increments('id');
      collection.string('title', {
        length: 255,
        nullable: false,
        title: '标题',
      });
      collection.text('content', { nullable: false, title: '正文' });
      collection.boolean('confidential', {
        nullable: false,
        defaultValue: false,
        title: '仅主管可读',
      });
      collection.datetime('createdAt', { nullable: false, title: '创建时间' });
      collection.datetime('updatedAt', { nullable: false, title: '更新时间' });
      collection.unique(['title'], { name: 'materials_title_unique' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('materials');
  },
});

export default migration;
