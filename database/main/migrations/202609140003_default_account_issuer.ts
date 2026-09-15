import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Gives the authentication `account` table's `issuer` column a default.
 *
 * `@nocobase/app-plugin-authentication` declares `issuer` NOT NULL, and its own seed and user-administration code
 * always supply `local:credential`. Better Auth's email/password sign-up path does not send an `issuer`, so a
 * visitor registering through the sign-up page fails with `NOT NULL constraint failed: account.issuer` and the
 * requirement that ordinary users can self-register cannot be met.
 *
 * The plugin is a compiled package this application may not edit, so the compatibility fix belongs here as an
 * application migration. A default keeps the column NOT NULL (the constraint the plugin relies on) while letting
 * the credential sign-up insert succeed. The `down` removes the default again.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609140003_default_account_issuer',

  async up({ builder }) {
    await builder.alterCollection('account', (collection) => {
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
