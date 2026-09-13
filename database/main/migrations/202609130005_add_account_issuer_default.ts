import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Defaults `account.issuer` for rows created by the email/password sign-up flow.
 *
 * The Authentication plugin creates `account.issuer` as `NOT NULL` without a
 * default, and NocoBase's own paths (the seeded administrator, User management)
 * always write it explicitly as `local:credential`. Better Auth's credential
 * sign-up does not: it links the account with only `providerId`/`accountId`/
 * `password`, so the insert violates the NOT NULL constraint and `POST
 * /api/auth/sign-up/email` fails with a 500.
 *
 * Giving the column the same database default the plugin uses elsewhere lets
 * that insert succeed without changing the column's NOT NULL guarantee or any
 * explicitly written value. This is an application-owned repair of the
 * authentication schema; it must stay until the plugin supplies the default
 * itself, at which point it becomes a harmless no-op.
 *
 * The `account` table belongs to the Authentication plugin's migrations, so
 * this runs only when that table is present. A database built from this
 * directory alone (for example a focused test) has no `account` collection and
 * is left untouched.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130005_add_account_issuer_default',

  async up({ builder }) {
    if (!(await builder.hasCollection('account'))) return;
    await builder.alterCollection('account', (collection) => {
      collection.alterField('issuer', issuerField('local:credential'));
    });
  },

  async down({ builder }) {
    if (!(await builder.hasCollection('account'))) return;
    await builder.alterCollection('account', (collection) => {
      collection.alterField('issuer', issuerField(null));
    });
  },
});

/** The complete field shape; an alter must restate the type it keeps. */
function issuerField(defaultValue: unknown) {
  return {
    type: 'string' as const,
    length: 255,
    nullable: false,
    defaultValue,
  };
}

export default migration;
