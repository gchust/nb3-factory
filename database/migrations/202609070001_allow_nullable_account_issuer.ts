import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Allow `account.issuer` to be NULL.
 *
 * The authentication plugin's migration `202608200001_create_authentication_tables`
 * creates `account.issuer` as NOT NULL, matching better-auth 1.7.2's account
 * schema. better-auth 1.7.3 (resolved by the production install) removed the
 * `issuer` field from the account schema and no longer writes it when linking
 * a local credential account during sign-up, so the insert omits the column
 * and fails the NOT NULL constraint (HTTP 500 on sign-up).
 *
 * The application does not rely on `issuer` being present: the plugin's server
 * code never reads it, and the unique index `uq_account_issuer_account` on
 * `(issuer, accountId)` still guards OAuth accounts that do set it (SQLite
 * treats NULLs as distinct in unique indexes).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609070001_allow_nullable_account_issuer',

  async up({ builder }) {
    await builder.alterField('account', 'issuer', { nullable: true });
  },

  async down({ builder }) {
    await builder.alterField('account', 'issuer', { nullable: false });
  },
});

export default migration;
