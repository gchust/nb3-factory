import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609010004_service_assistant',
  async up({ builder }) {
    await builder.createCollection('serviceAssistantMessages', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64, nullable: false });
      collection.integer('orderId', { nullable: true });
      collection.enum('role', {
        values: ['user', 'assistant'],
        nullable: false,
      });
      collection.text('content', { nullable: false });
      // The assistant's structured reply (citations, draft, grounding and
      // degradation flags). Null for a user message.
      collection.json('payload', { nullable: true });
      collection.boolean('degraded', {
        defaultValue: false,
        nullable: false,
      });
      collection.datetime('createdAt', { nullable: false });
      collection.index(['userId', 'createdAt'], {
        name: 'idx_service_assistant_user_time',
      });
      collection.index('orderId', {
        name: 'idx_service_assistant_order',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('serviceAssistantMessages');
  },
});

export default migration;
