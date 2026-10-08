import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The one-time provisioning boundary of the document library.
 *
 * The library ships demonstration accounts, their initial permission-set
 * assignments and a few sample documents. Those are created once by the
 * runtime provisioning routine, which records this marker when it succeeds.
 * The marker is what stops a later boot from re-adding an assignment or a
 * sample document an administrator removed — permission sets stay editable
 * configuration, and a one-off provisioning routine needs an explicit
 * completion boundary rather than a create-if-missing check alone.
 *
 * Self-contained like every migration: the shape is spelled out here, never
 * imported from a declaration that keeps evolving.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010002_create_library_provisioning',

  async up({ builder }) {
    await builder.createCollection('libraryProvisioning', (collection) => {
      collection.increments('id');
      collection.string('key', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.unique('key', { name: 'uq_library_provisioning_key' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('libraryProvisioning');
  },
});

export default migration;
