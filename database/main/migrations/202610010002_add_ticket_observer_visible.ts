import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Adds the supervisor-controlled flag that decides whether a non-confidential
 * ticket's summary may be seen by read-only observers.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010002_add_ticket_observer_visible',
  async up({ builder }) {
    await builder.alterCollection('tickets', (collection) => {
      collection.boolean('observerVisible', {
        nullable: false,
        defaultValue: false,
      });
    });
    await builder.addIndex('tickets', {
      name: 'idx_tickets_observer_visible',
      fields: ['observerVisible'],
    });
  },
  async down({ builder }) {
    await builder.dropIndex('tickets', 'idx_tickets_observer_visible');
    await builder.alterCollection('tickets', (collection) => {
      collection.dropField('observerVisible');
    });
  },
});

export default migration;
