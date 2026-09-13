import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Gives `account.issuer` the default the Authentication plugin already uses when
 * it creates a credential account itself (`local:credential`).
 *
 * Better Auth's own `sign-up/email` path links the credential account without
 * setting `issuer`, so with the column NOT NULL and no default every
 * self-registration fails with `NOT NULL constraint failed: account.issuer`.
 * Authentication is the owner of this table; this migration only supplies the
 * missing default so the shipped Sign up page works, and can be dropped once
 * the plugin's Auth setup sets the value itself.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130003_default_account_issuer',

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
      collection.alterField('issuer', {
        type: 'string',
        length: 255,
        defaultValue: null,
      });
    });
  },
});

export default migration;
