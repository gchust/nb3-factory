import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// The authentication plugin declares `account.issuer` NOT NULL and fills it itself when an
// administrator creates a user, but better-auth's own sign-up — the public registration page —
// inserts the account row without an issuer, so registration failed on the NOT NULL constraint.
// A database default supplies the same issuer the plugin's own user administration writes.
//
// The change cannot be reversed: SQLite cannot drop a column default without rebuilding the table,
// and removing it would break self-registration again. Rolling back is therefore refused rather
// than silently leaving the default in place.
const migration: MigrationDefinition = defineMigration({
  name: '202609140003_default_account_issuer',
  irreversible: true,

  async up({ builder, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('account'))) return;
    await builder.alterCollection('account', (collection) => {
      collection.alterField('issuer', {
        type: 'string',
        length: 255,
        nullable: false,
        defaultValue: 'local:credential',
      });
    });
  },
});

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default migration;
