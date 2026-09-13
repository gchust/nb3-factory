import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Gives the authentication plugin's `account.issuer` column a default.
 *
 * The plugin migration declares `issuer` as NOT NULL and its own administration
 * paths (the default-admin seed, `user-administration`) always write
 * `'local:credential'`. The bundled better-auth credential provider does not
 * know the column and omits it when it inserts an account, so email/password
 * self-registration fails with `NOT NULL constraint failed: account.issuer`.
 * A column default lets that insert succeed while keeping the NOT NULL
 * contract and the `(issuer, accountId)` uniqueness intact.
 *
 * The `account` table belongs to the authentication plugin, so the operation is
 * skipped when that plugin's migrations are not part of the run (some tests
 * apply only `database/main/migrations`). In the application the plugin is
 * always registered, and its migration sorts before this one.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130004_default_account_issuer',

  async up({ builder }) {
    if (!(await builder.hasCollection('account'))) return;
    await builder.alterField('account', 'issuer', {
      type: 'string',
      length: 255,
      nullable: false,
      defaultValue: 'local:credential',
    });
  },

  async down({ builder }) {
    if (!(await builder.hasCollection('account'))) return;
    await builder.alterField('account', 'issuer', {
      type: 'string',
      length: 255,
      nullable: false,
    });
  },
});

export default migration;
