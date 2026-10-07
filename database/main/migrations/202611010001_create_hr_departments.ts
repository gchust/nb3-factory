import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The department tree the HR feature hangs off.
 *
 * `managerId` holds an application user id (`user.id`), not an employee id:
 * department headship is what the authorization plugin resolves to grant a
 * supervisor their own department's records, and subjects resolve for users.
 * Deleting is not part of the model — a department that closes is `active:
 * false`, so the records that reference it keep their meaning.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010001_create_hr_departments',
  async up({ builder }) {
    await builder.createCollection('hrDepartments', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.string('code', { length: 64 }).nullable();
      collection.integer('parentId').nullable();
      collection.string('managerId', { length: 64 }).nullable();
      collection.boolean('active', { defaultValue: true }).notNull();
      collection.integer('sortOrder', { defaultValue: 0 }).notNull();
      collection.text('description').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('parentId', { name: 'idx_hr_departments_parent' });
      collection.index('managerId', { name: 'idx_hr_departments_manager' });
      collection.index('active', { name: 'idx_hr_departments_active' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('hrDepartments');
  },
});

export default migration;
