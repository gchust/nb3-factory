import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';
import type { Knex } from 'knex';

/**
 * The Authentication plugin created `account.issuer` as NOT NULL, but the Better Auth
 * version wired into this application writes first-party (username / email) sign-up
 * accounts without an `issuer` value. As a result public self-registration
 * (`POST /api/auth/sign-up/email`) fails with "NOT NULL constraint failed: account.issuer".
 *
 * This application-owned migration relaxes the column so issuer-less credential
 * accounts are accepted, while keeping the existing `uq_account_issuer_account`
 * unique index and any issuer-valued (OAuth-style) rows intact.
 *
 * It deliberately uses the raw knex client instead of `builder.alterCollection`:
 * the alter builder validates the field against collection metadata, which only
 * exists once the app runtime (with the Authentication plugin's collection
 * definitions) is loaded — a bare database manager, as migration tests use, has no
 * such metadata for `account`. The physical column is the only thing that must
 * change: Better Auth writes `account` rows directly, and the collection metadata
 * document stores no nullability. SQLite 3.35+ cannot drop NOT NULL via plain
 * `ALTER COLUMN`, so knex performs its table-rebuild DDL, which re-creates the
 * unique index as well.
 *
 * When the `account` table is absent (a bare test database that runs only this
 * application's migrations) the migration is a no-op: the table belongs to the
 * Authentication plugin, which owns its schema.
 *
 * NOTE: `down` restores NOT NULL; it fails if issuer-less accounts exist by then,
 * which is the honest reverse of this change.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609140001_allow_nullable_account_issuer',

  async up({ connection }: MigrationContext): Promise<void> {
    const knex = await connection.client<Knex>();
    if (!(await knex.schema.hasTable('account'))) {
      // `account` is owned by the Authentication plugin; nothing to relax here.
      return;
    }
    await knex.schema.alterTable('account', (table) => {
      table.string('issuer', 255).nullable().alter();
    });
  },

  async down({ connection }: MigrationContext): Promise<void> {
    const knex = await connection.client<Knex>();
    if (!(await knex.schema.hasTable('account'))) {
      return;
    }
    await knex.schema.alterTable('account', (table) => {
      table.string('issuer', 255).notNullable().alter();
    });
  },
});

export default migration;
