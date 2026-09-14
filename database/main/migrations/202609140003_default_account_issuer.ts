import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Compatibility fix for the Authentication account table.
 *
 * The Authentication migration declares `account.issuer` as NOT NULL without a default, while the
 * installed Better Auth version neither knows the column nor supplies it when it creates a
 * credential account. Registration and administrator-created users therefore failed with
 * `NOT NULL constraint failed: account.issuer`.
 *
 * Giving the column the same default the authentication module itself uses (`local:credential`)
 * lets Better Auth's inserts succeed without the application reimplementing account creation.
 *
 * This is irreversible: the field builder cannot express "remove the default" on an existing
 * column, so rolling back would require a table rebuild that risks existing accounts. `down` is
 * intentionally absent and the migration is marked irreversible so the runner never pretends it
 * was reversed.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609140003_default_account_issuer',
  irreversible: true,

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
});

export default migration;
