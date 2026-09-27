import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Front-desk visitor register.
 *
 * `employeeName` is stored as free text on purpose: the visited person is a
 * name the receptionist types, not a reference to an application account, so a
 * visitor can be registered for someone who has no user in this application.
 *
 * `arrivedAt` / `departedAt` are instants. A visitor who has not left yet has
 * `departedAt = NULL`; "still on site" is exactly that predicate.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202601150001_create_visitors',
  async up({ builder }) {
    await builder.createCollection('visitors', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 100 }).notNull();
      collection.string('phone', { length: 20 }).notNull();
      collection.string('reason', { length: 255 }).notNull();
      collection.string('employeeName', { length: 100 }).notNull();
      // Arrival and departure are absolute instants, so the register reads and
      // writes the same moment regardless of where the server runs.
      collection.datetimeTz('arrivedAt').notNull();
      collection.datetimeTz('departedAt').nullable();
      collection.index(['arrivedAt']);
      collection.index(['employeeName']);
    });
  },
  async down({ builder }) {
    await builder.dropCollection('visitors');
  },
});

export default migration;
