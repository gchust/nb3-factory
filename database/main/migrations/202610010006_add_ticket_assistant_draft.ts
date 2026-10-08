import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The assistant's suggestion lives beside the ticket until a person confirms
 * it. It is deliberately not the resolution note: saving a draft never changes
 * the ticket status and never closes it, and the note itself is only written by
 * the explicit "submit result" transition.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010006_add_ticket_assistant_draft',
  async up({ builder }) {
    await builder.alterCollection('tickets', (collection) => {
      collection.text('assistantDraft');
    });
  },
  async down({ builder }) {
    await builder.alterCollection('tickets', (collection) => {
      collection.dropField('assistantDraft');
    });
  },
});

export default migration;
