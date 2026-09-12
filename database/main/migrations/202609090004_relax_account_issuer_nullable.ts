import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Repair for normal-user registration (factory verification failure).
 *
 * The authentication plugin's `202608200001_create_authentication_tables`
 * migration defines `account.issuer` as NOT NULL, but the bundled
 * better-auth version no longer writes `issuer` on the self-registration
 * path: its sign-up route calls `linkAccount({ userId, providerId,
 * accountId, password })` without an issuer, so every sign-up INSERT
 * violated the constraint (SQLITE_CONSTRAINT_NOTNULL / "NOT NULL
 * constraint failed: account.issuer"). The authenticated sign-up page
 * (`POST /api/auth/sign-up/email`) and any third-party (OAuth) account
 * linking hit the same insert.
 *
 * The column itself is still required: the plugin's admin "add user"
 * path (`user-administration`) inserts accounts with
 * `issuer: 'local:credential'`. So the fix keeps the column and only
 * relaxes the NOT NULL constraint to NULL.
 *
 * The unique index `uq_account_issuer_account` is on `(issuer,
 * account_id)` and SQLite treats NULLs as distinct, so multiple
 * self-registered accounts (NULL issuer) do not collide with each other
 * or with admin-created accounts ('local:credential').
 *
 * This migration sorts after the plugin migration (202609080001 is the
 * plugin's latest) and after the application's earlier contract
 * migrations, so it always runs once `account` exists.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609090004_relax_account_issuer_nullable',

  async up({ builder }) {
    // `account` is created by the authentication plugin migration, so
    // bare-DB contexts that run only this application's migrations (the
    // repository's own test harness) never see it. Skip instead of failing:
    // the repair only matters where the plugin's tables actually exist.
    if (!(await builder.hasCollection('account'))) {
      return;
    }

    // The type/length are mandatory: the schema compiler passes plain
    // nullability changes to the SQL adapter without a column type, and
    // SQLite's ALTER machinery then rebuilds the whole table declaring the
    // altered column as type `undefined`, which breaks every subsequent
    // metadata validation. Spelling out the logical type and length keeps
    // the rebuild identical to the plugin's `issuer varchar(255)`.
    await builder.alterField('account', 'issuer', {
      nullable: true,
      type: 'string',
      length: 255,
    });
  },

  // Reverse: only valid while no NULL-issuer rows exist (e.g. rolling
  // back before any self-registered accounts were created). Re-running
  // up after a failed down requires pruning NULL rows first.
  async down({ builder }) {
    if (!(await builder.hasCollection('account'))) {
      return;
    }
    await builder.alterField('account', 'issuer', {
      nullable: false,
      type: 'string',
      length: 255,
    });
  },
});

export default migration;
