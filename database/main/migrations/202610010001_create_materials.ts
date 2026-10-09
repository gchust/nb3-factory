import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The `materials` table behind the internal read-only material assistant.
 *
 * A material is a short piece of internal reference text (title + body). The
 * `confidential` flag is what the record-level access rule in
 * `server/materials/record-access.ts` reads: ordinary colleagues never see a
 * confidential row, supervisors see every row.
 *
 * The definition is spelled out here rather than imported from a shared
 * constant on purpose: a migration is immutable history, and a definition that
 * keeps evolving would silently change what an already-applied migration means.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_create_materials',

  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200, nullable: false });
      collection.text('body', { nullable: false });
      collection.boolean('confidential', {
        nullable: false,
        defaultValue: false,
      });
      // Titles are the stable business key the seed and the assistant cite, so
      // they must be unique.
      collection.unique('title');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('materials');
  },
});

export default migration;
