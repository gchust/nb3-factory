import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the shared equipment ledger: the records the team borrows from and returns to.
 *
 * `code` is the ledger number the office already uses, so it is required and unique. `status` holds one of the
 * application's status values (`available` or `borrowed`); the enum is enforced by the API, not by the column, so a
 * later status only needs a new value there and a translation, not a migration. `createdAt`/`updatedAt` are written
 * by the service, because the database layer does not populate timestamps on its own.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610200001_create_equipment',

  async up({ builder }) {
    await builder.createCollection('equipment', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull();
      collection.string('name', { length: 191 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.text('notes').nullable();
      // `datetimeTz` keeps the instant, so what the API returns as RFC 3339 does not depend on the server's zone.
      collection.datetimeTz('createdAt').notNull();
      collection.datetimeTz('updatedAt').notNull();

      collection.unique('code', { name: 'uq_equipment_code' });
      collection.index('status', { name: 'idx_equipment_status' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('equipment');
  },
});

export default migration;
