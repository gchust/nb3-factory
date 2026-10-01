import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// The assistant's persistent transcript. One row per message, owned by the
// application user who asked, so the conversation survives a page refresh.
// `citations` stores the materials an answer was grounded in as JSON, and
// `outcome` records how the assistant answered (`answered`, `insufficient` or
// `denied`) so the browser can word an empty answer in the reader's language.
// `outcome` is null on a user turn.
const migration: MigrationDefinition = defineMigration({
  name: '202610010002_create_assistant_messages',
  async up({ builder }) {
    await builder.createCollection(
      'assistantMessages',
      (collection) => {
        collection.increments('id');
        collection.string('userId', { length: 64 }).notNull();
        collection.string('role', { length: 16 }).notNull();
        collection.text('content').notNull();
        collection.json('citations').nullable();
        collection.string('outcome', { length: 32 }).nullable();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.primary('id', { name: 'pk_assistant_messages' });
        collection.index(['userId', 'id'], {
          name: 'idx_assistant_messages_user',
        });
      },
      { ifNotExists: true },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('assistantMessages');
  },
});

export default migration;
