import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Address book storage.
 *
 * `department` is stored as a stable code (`rd`, `sales`, `admin`) rather than a
 * localized label, so renaming the department in the interface never rewrites
 * rows. The allowed values are enforced by the contacts service on write.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609020001_create_contacts',
  async up({ builder }) {
    await builder.createCollection('contacts', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 100, nullable: false });
      collection.string('department', { length: 32, nullable: false });
      collection.string('phone', { length: 32, nullable: true });
      collection.text('notes', { nullable: true });
      collection.index('name');
      collection.index('department');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('contacts', { ifExists: true });
  },
});

export default migration;
