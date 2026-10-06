import { defineMigration } from '@nocobase/db';

/**
 * The one table the read-only knowledge assistant is built on: a material has a title and a body, and nothing else.
 *
 * The requirement is that the system maintains exactly two content items, so the table holds exactly those. Which
 * materials a person may read is not a column: it is a record scope in a permission-set grant, so the server applies
 * it to every query rather than trusting a flag the row carries.
 *
 * Fixed 64-character string identifiers let the initial data reference its own rows (and the colleague's record
 * selection name them) without depending on the order rows happen to be inserted in.
 */
const migration = defineMigration({
  name: '202610030001_create_knowledge_materials',
  async up({ builder }) {
    await builder.createCollection('knowledgeMaterials', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('content').notNull();
      collection.primary('id', { name: 'pk_knowledge_materials' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('knowledgeMaterials');
  },
});

export default migration;
