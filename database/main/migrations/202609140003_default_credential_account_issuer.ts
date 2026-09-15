import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Self-registration failed on a fresh install with
 * `NOT NULL constraint failed: account.issuer`.
 *
 * The Authentication plugin's `account.issuer` column is NOT NULL, but the
 * better-auth email/password sign-up path inserts a credential account without
 * an issuer, while the plugin's own administration code writes
 * `local:credential` explicitly. Giving the column that same default lets both
 * paths agree; it changes no existing row value.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609140003_default_credential_account_issuer',

  async up({ builder }) {
    await builder.alterCollection('account', (collection) => {
      // The field's type and length are repeated deliberately: an alter must
      // describe the resulting column completely, not just the delta.
      collection.alterField('issuer', {
        type: 'string',
        length: 255,
        nullable: false,
        defaultValue: 'local:credential',
      });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('account', (collection) => {
      collection.alterField('issuer', {
        type: 'string',
        length: 255,
        nullable: false,
        defaultValue: null,
      });
    });
  },
});

export default migration;
