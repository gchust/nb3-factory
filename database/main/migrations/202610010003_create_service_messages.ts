import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Application-owned in-app message inbox. The application writes one row per
 * recipient when a business event needs to reach a person; the shell shows
 * unread counts and the message center page lists them.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010003_create_service_messages',
  async up({ builder }) {
    await builder.createCollection('service_messages', (collection) => {
      collection.increments('id');
      collection.string('recipientId', { length: 64, nullable: false });
      collection.string('kind', { length: 64, nullable: false });
      collection.string('title', { length: 255, nullable: false });
      collection.text('body', { nullable: true });
      collection.string('route', { length: 255, nullable: true });
      collection.string('ticketId', { length: 64, nullable: true });
      collection.boolean('read', { nullable: false, defaultValue: false });
      collection.datetime('readAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.index('recipientId', {
        name: 'idx_service_messages_recipient',
      });
      collection.index('read', { name: 'idx_service_messages_read' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('service_messages');
  },
});

export default migration;
