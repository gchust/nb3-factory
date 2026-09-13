import { defineMigration, type MigrationDefinition } from '@nocobase/db';
import type { Knex } from 'knex';

/**
 * The bundled Authentication migration declares `account.issuer` as NOT NULL
 * without a default, but the installed Better Auth version does not write that
 * column when a user signs up. Registration therefore fails on a fresh
 * installation. Adding a database default lets the credential provider insert
 * an account without changing the plugin, and keeps the (issuer, accountId)
 * uniqueness rule meaningful.
 *
 * The collection builder cannot express this change (the plugin registers the
 * field with a physical type the builder will not re-declare), so the column
 * default is applied directly through the connection's schema builder.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130007_repair_account_issuer_default',

  async up({ connection }) {
    const client = await connection.client<Knex>();
    await client.schema.alterTable('account', (table) => {
      table
        .string('issuer', 255)
        .notNullable()
        .defaultTo('local:credential')
        .alter();
    });
  },

  async down({ connection }) {
    const client = await connection.client<Knex>();
    await client.schema.alterTable('account', (table) => {
      table.string('issuer', 255).notNullable().alter();
    });
  },
});

export default migration;
