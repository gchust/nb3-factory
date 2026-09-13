import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Self-registration through Sign up fails on a fresh install: the
// Authentication plugin created `account.issuer` as NOT NULL with no default,
// while better-auth's own sign-up path never supplies it. It only inserts
// id/accountId/providerId/userId/password/timestamps, so the NOT NULL
// constraint aborts account creation.
//
// `local:credential` is the issuer the plugin itself uses for accounts it
// creates (the default administrator and the user-administration flows), so a
// default makes a self-registered credential account identical to those.
// Without it the application cannot offer registration at all.
const migration: MigrationDefinition = defineMigration({
  name: '202609130006_default_account_issuer',

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
