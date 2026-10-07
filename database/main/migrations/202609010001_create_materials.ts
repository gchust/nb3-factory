import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// The internal materials the read-only assistant answers from. `restricted` marks a material only a supervisor may
// read; the record-access rule that hides it from colleagues is declared in `server/authorization/index.ts` and the
// permission sets that reference it are seeded in `database/main/seeds/`.
const migration: MigrationDefinition = defineMigration({
  name: '202609010001_create_materials',

  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200, nullable: false });
      collection.text('body', { nullable: false });
      collection.boolean('restricted', {
        nullable: false,
        defaultValue: false,
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('restricted', { name: 'idx_materials_restricted' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('materials');
  },
});

export default migration;
