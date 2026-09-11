import { defineMigration, type MigrationDefinition } from '@nocobase/db';
import type { Knex } from 'knex';

/**
 * Repair native email/password registration.
 *
 * The authentication plugin's account table declares `issuer` NOT NULL, but
 * better-auth's `credential` provider inserts account rows without an issuer
 * (only OAuth accounts carry one). Every self-sign-up therefore failed with
 * "NOT NULL constraint failed: account.issuer" and surfaced as an HTTP 500.
 * The default administrator seed happens to provide `issuer: 'local:credential'`,
 * which is why only self-registration was affected.
 *
 * SQLite cannot drop a NOT NULL constraint in place, and the collection builder
 * alter path is unsafe for this plugin-owned table in this environment, so the
 * migration rebuilds the table with knex's own SQLite re-create logic, which
 * preserves every other column, the primary key, and both indexes exactly.
 *
 * The column can already be nullable on installations whose newer auth plugin
 * ships a fixed migration; the guard below makes this migration a no-op then.
 *
 * Scope: the factory runtime is SQLite, and the defect is observed there. On
 * other dialects this migration deliberately does nothing rather than risk
 * dialect-specific rebuilds of a plugin-owned table from the application.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_repair_auth_account_issuer_nullable',

  async up({ connection }) {
    if (connection.dialect !== 'sqlite') {
      return;
    }
    const knex = await connection.client<Knex>();
    const columns: Array<{ name: string; type: string; notnull: number }> =
      await knex.raw('PRAGMA table_info(??)', ['account']);
    const issuer = columns.find((column) => column.name === 'issuer');
    // Already nullable (plugin fixed upstream) or table missing: nothing to do.
    if (!issuer || issuer.notnull !== 1) {
      return;
    }
    await knex.schema.alterTable('account', (table) => {
      table.string('issuer', 255).nullable().alter();
    });
  },

  async down({ connection }) {
    if (connection.dialect !== 'sqlite') {
      return;
    }
    const knex = await connection.client<Knex>();
    const columns: Array<{ name: string; type: string; notnull: number }> =
      await knex.raw('PRAGMA table_info(??)', ['account']);
    const issuer = columns.find((column) => column.name === 'issuer');
    if (!issuer || issuer.notnull === 1) {
      return;
    }
    // The default admin seed's convention for credential accounts.
    await knex('account')
      .whereNull('issuer')
      .update({ issuer: 'local:credential' });
    await knex.schema.alterTable('account', (table) => {
      table.string('issuer', 255).notNullable().alter();
    });
  },
});

export default migration;
