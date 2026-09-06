import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * IT service desk tickets.
 *
 * The collection stores the full ticket record. Category, priority and status use a fixed vocabulary (kept in
 * `server/providers/it-ticket-service.ts`) instead of lookup tables, so the list filters and the UI dropdowns share
 * one source of truth. requesterId/assigneeId reference the `user` collection owned by
 * `@nocobase/app-plugin-authentication`; names are joined at query time.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609060001_create_it_tickets',

  async up({ builder }) {
    await builder.createCollection('itTickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.text('description', { nullable: false });
      collection.string('category', { length: 64, nullable: false });
      collection.string('priority', { length: 32, nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.string('requesterId', { length: 64, nullable: false });
      collection.string('assigneeId', { length: 64, nullable: true });
      collection.text('resolution', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('status');
      collection.index('priority');
      collection.index('category');
      collection.index('requesterId');
      collection.index('assigneeId');
      collection.index('createdAt');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('itTickets');
  },
});

export default migration;
