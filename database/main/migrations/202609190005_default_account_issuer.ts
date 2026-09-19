import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609190005_default_account_issuer',

  // A runtime without the authentication plugin has no `account` collection;
  // this migration only applies where that plugin contributes the table.
  async shouldRun({ builder }) {
    return builder.hasCollection('account');
  },

  async up({ builder }) {
    // The authentication schema declares `account.issuer` NOT NULL, but
    // Better Auth's credential sign-up does not supply a value, so registration
    // fails on that constraint. A column default matches what the
    // authentication plugin's own administration service writes.
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
