import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Better Auth's email/password sign-up inserts an `account` row without an
 * `issuer`, because `issuer` is not part of its account model. The
 * authentication plugin's schema declares `account.issuer` NOT NULL and its own
 * user-creation paths (the default admin seed and User management) write
 * `local:credential`. Without a database default, native registration fails with
 * `NOT NULL constraint failed: account.issuer` and returns HTTP 500.
 *
 * Give the column the same default so a registered credential account is stored
 * consistently with the administrator and User management paths.
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
