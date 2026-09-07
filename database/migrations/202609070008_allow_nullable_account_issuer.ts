import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Better Auth's email/password sign-up links a new account without an
 * `issuer` (that field is an OAuth concept), but the authentication plugin's
 * table migration created `account.issuer` as NOT NULL, so every sign-up
 * failed with `NOT NULL constraint failed: account.issuer`. Relax the column
 * to nullable; seeded accounts still write `local:credential` explicitly.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609070008_allow_nullable_account_issuer',
  async up({ builder }) {
    await builder.alterField('account', 'issuer', {
      type: 'string',
      length: 255,
      nullable: true,
    });
  },
  async down({ builder }) {
    await builder.alterField('account', 'issuer', {
      type: 'string',
      length: 255,
      nullable: false,
    });
  },
} satisfies MigrationDefinition);

export default migration;
