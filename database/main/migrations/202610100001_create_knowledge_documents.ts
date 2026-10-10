import { defineMigration } from '@nocobase/db';

// The internal document library behind the read-only "资料助手". Only the two
// user-visible fields (title, body) plus the visibility flag the permission
// layer reads are stored; the assistant never writes anything else.
const migration = defineMigration({
  name: '202610100001_create_knowledge_documents',
  async up({ builder }) {
    await builder.createCollection('knowledgeDocuments', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').notNull();
      // 'public' | 'restricted'. `restricted` documents are supervisor-only and
      // are filtered out of every query made under a colleague's policy.
      collection.string('visibility', { length: 32 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('title', { name: 'uq_knowledge_documents_title' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('knowledgeDocuments');
  },
});

export default migration;
