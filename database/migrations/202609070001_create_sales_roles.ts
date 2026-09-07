import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Roles and user-role assignments for the sales application.
 *
 * The application owns its own role model: the authorization plugin only
 * resolves `user` and `authenticated` subjects, so business routes resolve
 * these tables and add `{ type: 'role', id: <key> }` subjects themselves.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609070001_create_sales_roles',
  async up({ builder }) {
    await builder.createCollection('roles', (collection) => {
      collection.increments('id');
      collection.string('key', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('key', { name: 'uq_roles_key' });
    });

    await builder.createCollection('userRoles', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64 }).notNull();
      collection.integer('roleId').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['userId', 'roleId'], {
        name: 'uq_user_roles_user_role',
      });
      collection.index('roleId', { name: 'idx_user_roles_role' });
      collection.foreignKey('userId', {
        name: 'fk_user_roles_user',
        references: { collection: 'user', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.foreignKey('roleId', {
        name: 'fk_user_roles_role',
        references: { collection: 'roles', fields: ['id'] },
        onDelete: 'cascade',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('userRoles');
    await builder.dropCollection('roles');
  },
} satisfies MigrationDefinition);

export default migration;
