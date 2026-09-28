import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Equipment manuals the service assistant may cite, and the persisted
 * conversations so a refresh restores the thread. Manuals are application
 * data; published versions are readable by engineers but not writable by them.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609250006_create_service_manuals_conversations',

  async up({ builder }) {
    await builder.createCollection('serviceManuals', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.string('version', {
        length: 32,
        nullable: false,
        defaultValue: 'v1',
      });
      collection.string('deviceModel', { length: 128, nullable: true });
      collection.text('content', { nullable: false });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'published',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['title', 'version']);
    });

    await builder.createCollection(
      'serviceAssistantConversations',
      (collection) => {
        collection.increments('id');
        collection.string('userId', { length: 64, nullable: false });
        collection.string('title', { length: 255, nullable: true });
        collection.json('messages', { nullable: false });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.index('userId');
      },
    );
  },

  async down({ builder }) {
    await builder.dropCollection('serviceAssistantConversations');
    await builder.dropCollection('serviceManuals');
  },
});

export default migration;
