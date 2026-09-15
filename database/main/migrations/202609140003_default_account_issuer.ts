import { defineMigration, type MigrationDefinition } from '@nocobase/db';

interface SchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

/**
 * Compatibility fix for a baseline defect in the installed Authentication plugin.
 *
 * Its own migration creates `account.issuer` as NOT NULL with no default, and only its own account-creation
 * paths fill it in (`'local:credential'`). Better Auth's built-in email sign-up writes an account row without
 * `issuer`, so a self-service Sign up fails with `SQLITE_CONSTRAINT_NOTNULL` and registration is impossible.
 * Giving the column the same default the plugin uses for the accounts it creates keeps Sign up working without
 * modifying the plugin. Remove this migration once the plugin sets the value itself.
 *
 * The guard makes the migration a no-op on a database where the Authentication tables are not present, such as a
 * test that applies only this application's migrations.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609140003_default_account_issuer',

  async up({ builder, connection }) {
    const client = await connection.client<SchemaClient>();
    if (!(await client.schema.hasTable('account'))) return;
    await builder.alterCollection('account', (collection) => {
      collection.alterField('issuer', {
        type: 'string',
        length: 255,
        defaultValue: 'local:credential',
      });
    });
  },

  async down({ builder, connection }) {
    const client = await connection.client<SchemaClient>();
    if (!(await client.schema.hasTable('account'))) return;
    await builder.alterCollection('account', (collection) => {
      collection.alterField('issuer', { type: 'string', length: 255 });
    });
  },
});

export default migration;
