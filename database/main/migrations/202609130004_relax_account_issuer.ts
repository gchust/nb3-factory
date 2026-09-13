import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Better Auth 1.7.3 stopped writing `account.issuer`; accounts are recognised by
// `providerId` + `accountId` again (see the Better Auth 1.7 upgrade guide). The
// authentication plugin's table migration still declares `issuer` as NOT NULL, so every
// insert Better Auth performs — sign-up and the admin Add-user flow alike — fails with
// "NOT NULL constraint failed: account.issuer" because the field it never sends cannot be
// filled. Relaxing the constraint restores credential sign-up; the column and its value
// stay because the plugin's admin seed and user-administration code still write
// 'local:credential' explicitly, and rows carrying that value must keep working.
//
// The unique (issuer, accountId) index is intentionally left in place. The guide's
// "drop the index first" warning applies to MySQL when the column itself is dropped;
// this migration keeps the column, and SQLite treats NULL issuers as distinct, so
// credential rows (issuer 'local:credential') remain unique per account.
const migration: MigrationDefinition = defineMigration({
  name: '202609130004_relax_account_issuer',

  async up({ builder }) {
    // The existing type and length are restated: an alterColumn operation that omits the
    // logical type is planned as an untyped (native) column, which then fails collection
    // resolution against the stored `string` metadata.
    await builder.alterCollection('account', (collection) => {
      collection.alterField('issuer', {
        type: 'string',
        length: 255,
        nullable: true,
      });
    });
  },

  async down({ builder, query }) {
    // Restoring NOT NULL fails while any NULL issuer remains, so first give every
    // credential account the value the application writes elsewhere.
    await query
      .updateTable('account')
      .set({ issuer: 'local:credential' })
      .where('issuer', 'is', null)
      .execute();

    await builder.alterCollection('account', (collection) => {
      collection.alterField('issuer', {
        type: 'string',
        length: 255,
        nullable: false,
      });
    });
  },
});

export default migration;
