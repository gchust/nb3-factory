import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Gives `account.issuer` a default so public registration works.
 *
 * The authentication tables define `issuer` as NOT NULL, and the application's
 * own account creation (the default administrator and the Users page) always
 * writes `'local:credential'`. Better-auth's own email/password sign-up,
 * however, does not know the column at all and omits it, so a fresh
 * registration fails on the NOT NULL constraint. A column default fills the
 * gap without making the column nullable and without changing the value any
 * existing writer supplies.
 *
 * Irreversible on purpose: dropping a default is not needed to run the
 * application, and reversing it would only reintroduce the broken sign-up.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190006_default_account_issuer',
  irreversible: true,

  /**
   * Only applies where the authentication plugin has created its tables. A host
   * that composes the application without that plugin (the template's own
   * runtime test does) has no `account` collection to alter.
   */
  async shouldRun({ connection }) {
    const client = await connection.client<TableSchemaClient>();
    return client.schema.hasTable('account');
  },

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

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default migration;
