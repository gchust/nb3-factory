import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The IT ticket (报修/工单) table. A ticket is submitted by an employee, taken
 * over by a handler and completed with a resolution. The status transition is
 * enforced by the ticket routes, not by the schema.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_create_tickets',

  async up({ builder }) {
    await builder.createCollection('tickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200, nullable: false });
      collection.string('category', { length: 32, nullable: false });
      collection.text('description', { nullable: true });
      collection
        .string('status', { length: 32, nullable: false })
        .defaultTo('pending');
      collection.text('resolution', { nullable: true });
      collection.string('submitterId', { length: 64, nullable: false });
      collection.string('handlerId', { length: 64, nullable: true });
      collection.datetime('startedAt', { nullable: true });
      collection.datetime('completedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('status');
      collection.index('submitterId');
      collection.index('handlerId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('tickets');
  },
});

export default migration;
