import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Stored service-assistant turns, so a technician can come back to an earlier
 * conversation. Kept separate from `service_messages`, which is the in-app
 * inbox: this is a chat transcript, not a notification.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010005_create_assistant_messages',
  async up({ builder }) {
    await builder.createCollection('assistant_messages', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64, nullable: false });
      collection.string('role', { length: 16, nullable: false });
      collection.text('content', { nullable: false });
      collection.text('citations', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.index(['userId', 'createdAt'], {
        name: 'idx_assistant_messages_user_created',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('assistant_messages');
  },
});

export default migration;
