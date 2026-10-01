import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Durable service-assistant conversation history.
 *
 * The assistant used to answer and forget; the page lost every question,
 * answer and citation on refresh. This table stores one row per exchange for
 * the user who asked, so the page restores the conversation. It is deliberately
 * separate from the ticket's process note: a stored draft is a suggestion, not
 * a business write.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609020001_create_service_assistant_messages',

  async up({ builder }) {
    await builder.createCollection('serviceAssistantMessages', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64, nullable: false });
      collection.integer('ticketId');
      collection.text('question', { nullable: false });
      collection.text('answer', { nullable: false });
      collection.text('draft');
      collection.json('citations');
      collection.boolean('modelAvailable', {
        nullable: false,
        defaultValue: false,
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('userId');
      collection.index('ticketId');
      collection.index('createdAt');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('serviceAssistantMessages');
  },
});

export default migration;
