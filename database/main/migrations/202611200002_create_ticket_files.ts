import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The file plugin's collection for issue screenshots and resolution attachments. The columns are the plugin's fixed
 * contract (see the file plugin Skill); a migration spells them out so a later plugin release cannot change what this
 * migration already applied. The disk and access path live in `server/routes/file-routes.ts`.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611200002_create_ticket_files',

  async up({ builder }) {
    await builder.createCollection('ticket_files', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      // Who uploaded the file. The file plugin stamps it from the exposure's `create.defaults` on upload, so a reporter
      // can preview a screenshot in the form before the ticket that will name it exists.
      collection.string('ownerId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
  },

  async down({ builder }) {
    await builder.dropCollection('ticket_files');
  },
});

export default migration;
