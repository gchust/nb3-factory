import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The authentication plugin's `account` table declares `issuer` as NOT NULL,
 * but better-auth's email/password sign-up links a credential account without
 * an issuer (only OAuth providers set one). That makes one-time sign-up fail
 * with `SQLITE_CONSTRAINT_NOTNULL: account.issuer`. Relax the column so
 * credential accounts can be created; OAuth accounts still set an issuer, and
 * the unique index on (issuer, accountId) keeps OAuth rows unique while
 * SQLite treats NULL issuers as distinct.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609090003_allow_null_account_issuer',

  async up({ builder }) {
    // The `account` table is owned by the authentication plugin. When the
    // plugin is absent (e.g. isolated app-migration runs) there is nothing to
    // relax and the migration is a no-op.
    if (!(await builder.hasCollection('account'))) {
      return;
    }
    // Keep the declared varchar(255) type: without it the SQLite adapter
    // recreates the column as TEXT, which drifts from the collection metadata
    // (logical "string") and breaks collection resolution.
    await builder.alterField('account', 'issuer', {
      nullable: true,
      type: 'string',
      length: 255,
    });
  },

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
