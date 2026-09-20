import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Gives the authentication `account` table a default issuer.
 *
 * The authentication schema declares `issuer` NOT NULL, but better-auth's own email/password
 * sign-up inserts a credential account without that column, so self-registration fails with
 * `NOT NULL constraint failed: account.issuer`. The authentication administration service already
 * writes `local:credential` explicitly; a column default makes the sign-up path behave the same
 * without modifying the plugin's schema or replacing its CRUD.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200002_default_account_issuer',

  // The account table belongs to the authentication plugin. An application composed without it
  // (a minimal test app) has no such table, so this migration stays unapplied rather than failing.
  shouldRun: ({ builder }) => builder.hasCollection('account'),

  async up({ builder }) {
    await builder.alterCollection('account', (collection) => {
      collection.alterField('issuer', {
        type: 'string',
        length: 255,
        defaultValue: 'local:credential',
      });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('account', (collection) => {
      collection.alterField('issuer', { type: 'string', length: 255 });
    });
  },
});

export default migration;
