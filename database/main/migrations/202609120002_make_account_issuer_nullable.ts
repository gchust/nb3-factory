import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Repair the Better Auth `account` table so self-service registration works.
 *
 * The authentication plugin's `202608200001_create_authentication_tables`
 * migration declares `account.issuer` as NOT NULL. Better Auth inserts an
 * `issuer` value only for OAuth-linked accounts; the email/password (credential)
 * sign-up flow writes NULL, so registering through the UI fails with
 * `NOT NULL constraint failed: account.issuer`. The plugin's own programmatic
 * user creation path works around this by writing `issuer: 'local:credential'`,
 * which confirms the intended value semantics — but the public /sign-up route
 * does not go through that path.
 *
 * Making the column nullable lets Better Auth store credential accounts (NULL
 * issuer) exactly as its adapter expects. The `uq_account_issuer_account`
 * unique index stays valid: SQLite treats NULLs as distinct in unique indexes,
 * and OAuth accounts always carry a non-null issuer.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609120002_make_account_issuer_nullable',

  async up({ builder }) {
    await builder.alterCollection('account', (collection) => {
      collection.alterField('issuer', {
        type: 'string',
        length: 255,
        nullable: true,
      });
    });
  },

  async down({ builder }) {
    // Reinstating NOT NULL only succeeds while no credential account has been
    // registered (i.e. no NULL-issuer row exists). After the first self-service
    // sign-up the column cannot be tightened again without backfilling an
    // issuer, so this is a best-effort reverse rather than a silent no-op.
    await builder.alterCollection('account', (collection) => {
      collection.alterField('issuer', {
        type: 'string',
        length: 255,
        nullable: false,
      });
    });
  },
});

export default migration;
