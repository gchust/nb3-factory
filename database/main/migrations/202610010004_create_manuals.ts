import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Device manuals ("说明书") available to service engineers and to the service
 * assistant. The manual body stays in this table so the page works without any
 * AI service; `knowledgeBaseKey` links the entry to a vectorized knowledge
 * base, and `status`/`statusMessage` record the real synchronization outcome so
 * an unconfigured or failing AI service is visible instead of hidden.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010004_create_manuals',
  async up({ builder }) {
    await builder.createCollection('manuals', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.string('model', { length: 128 });
      collection.string('summary', { length: 512 });
      collection.text('body');
      collection.string('status', { length: 32, defaultValue: 'unconfigured' });
      collection.text('statusMessage');
      collection.string('knowledgeBaseKey', { length: 128 });
      collection.string('fileId', { length: 36 });
      collection.string('createdById', { length: 64 });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('model', { name: 'idx_manuals_model' });
      collection.index('status', { name: 'idx_manuals_status' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('manuals');
  },
});

export default migration;
