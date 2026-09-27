import { defineMigration } from '@nocobase/db';

/**
 * The two people a ticket records: who submitted it and who handled it.
 *
 * Kept out of `202610010001_create_it_tickets` because a relation whose target
 * is absent fails relation validation, and application migrations also run in
 * a runtime composed without the authentication plugin that owns `user`.
 * `shouldRun` reports applicability without recording history, so a runtime
 * that has the plugin adds the relations now and a runtime that later gains it
 * adds them then.
 *
 * The foreign keys are plain string columns with no database-level constraint,
 * matching the `user` identity column type, so this migration has no ordering
 * dependency on the plugin's table creation beyond the collection existing.
 */
export default defineMigration({
  name: '202610010002_add_it_ticket_people',
  shouldRun: ({ builder }) => builder.hasCollection('user'),
  async up({ builder }) {
    await builder.alterCollection('itTickets', (collection) => {
      collection
        .belongsTo('submitter', 'user')
        .targetKey('id')
        .foreignKey('submitterId')
        .foreignKeyType('string')
        .notNull();
      collection
        .belongsTo('handler', 'user')
        .targetKey('id')
        .foreignKey('handlerId')
        .foreignKeyType('string');
    });
  },
  async down({ builder }) {
    await builder.alterCollection('itTickets', (collection) => {
      collection.dropField('submitter');
      collection.dropField('handler');
    });
  },
});
