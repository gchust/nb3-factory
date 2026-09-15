import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Compatibility fix for public registration.
 *
 * The Authentication plugin declares `account.issuer` NOT NULL and writes `'local:credential'` on the paths it owns
 * (the default administrator seed and the user-administration service). Better Auth's own credential sign-up — the
 * path the application's Sign up page uses through `POST /api/auth/sign-up/email` — does not supply the column, so
 * without a default the insert fails with `NOT NULL constraint failed: account.issuer` and registration returns 500.
 *
 * Giving the column the same value the plugin writes keeps the NOT NULL guarantee and the (issuer, accountId)
 * uniqueness intact while letting the plugin's own sign-up path succeed. The full column definition is restated
 * because the schema builder rebuilds the table and cannot infer the logical type from a default alone.
 *
 * The Authentication plugin is optional for a database that never had it, so the migration is a no-op when the
 * `account` table is absent.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609140004_default_account_issuer',

  async up({ builder, connection }) {
    if (!(await hasAccountTable(connection))) return;
    await builder.alterCollection('account', (collection) => {
      collection.alterField('issuer', {
        type: 'string',
        length: 255,
        nullable: false,
        defaultValue: 'local:credential',
      });
    });
  },

  async down({ builder, connection }) {
    if (!(await hasAccountTable(connection))) return;
    await builder.alterCollection('account', (collection) => {
      collection.alterField('issuer', {
        type: 'string',
        length: 255,
        nullable: false,
      });
    });
  },
});

async function hasAccountTable(connection: {
  client<T = unknown>(): Promise<T>;
}): Promise<boolean> {
  const client = await connection.client<{
    readonly schema: { hasTable(table: string): Promise<boolean> };
  }>();
  return client.schema.hasTable('account');
}

export default migration;
