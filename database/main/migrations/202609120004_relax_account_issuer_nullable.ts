import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Better Auth's self-service email/password registration (`POST /api/auth/sign-up/email`)
// inserts an `account` row without an `issuer` value: the internal adapter's
// `linkAccount` only writes providerId/accountId/userId/password. The
// authentication plugin's `202608200001_create_authentication_tables` migration
// declared `account.issuer` as NOT NULL (it only matters for OAuth providers),
// so every normal-user registration fails on insert with
// `NOT NULL constraint failed: account.issuer`. The plugin's own administration
// path and its default-admin seed write `issuer: 'local:credential'` explicitly
// and keep working unchanged; relaxing the column lets self-registration persist.
//
// This migration deliberately uses the raw connection client instead of the
// collection builder: `account` is owned by the authentication plugin and its
// stored logical metadata (`issuer` type `string`) never reconciles with the
// reflected physical SQLite type (`native`), so any builder alter of that table
// fails collection resolution before reaching the database.
//
// SQLite cannot drop a NOT NULL constraint in place, so the table is rebuilt
// with the identical physical schema (same snake_case columns, primary key,
// unique index and secondary index as produced by the plugin's migration, in
// the same column order for `INSERT ... SELECT *`) except that `issuer` is
// nullable. Other dialects get a direct ALTER.
const migration: MigrationDefinition = defineMigration({
  name: '202609120004_relax_account_issuer_nullable',

  async up({ connection }) {
    const client = await connection.client<RawSqlClient>();
    const dialect = connection.dialect;

    // Environments that apply only the application's own migrations (for
    // example module tests) have no `account` table; there is nothing to
    // relax there, so do nothing. A real application database always has it
    // because the authentication plugin's migration runs first.
    try {
      await client.raw('SELECT count(*) FROM "account";');
    } catch {
      return;
    }

    if (dialect === 'sqlite') {
      await client.raw(`
        CREATE TABLE "account_relaxed" (
          "id" varchar(64) not null,
          "issuer" varchar(255) null,
          "account_id" varchar(320) not null,
          "provider_id" varchar(128) not null,
          "user_id" varchar(64) not null,
          "access_token" text null,
          "refresh_token" text null,
          "id_token" text null,
          "access_token_expires_at" text null,
          "refresh_token_expires_at" text null,
          "scope" text null,
          "password" text null,
          "created_at" text not null,
          "updated_at" text not null,
          constraint "pk_account" primary key ("id")
        );
      `);
      await client.raw(
        'INSERT INTO "account_relaxed" SELECT * FROM "account";',
      );
      await client.raw('DROP TABLE "account";');
      await client.raw('ALTER TABLE "account_relaxed" RENAME TO "account";');
      await client.raw(
        'CREATE UNIQUE INDEX "uq_account_issuer_account" on "account" ("issuer", "account_id");',
      );
      await client.raw(
        'CREATE INDEX "idx_account_user" on "account" ("user_id");',
      );
    } else if (dialect === 'postgres') {
      const result = (await client.raw(
        "select column_name from information_schema.columns where table_name = 'account' and column_name = 'issuer' and is_nullable = 'NO'",
      )) as { rows?: unknown[] };
      if ((result.rows ?? []).length === 0) {
        return;
      }
      await client.raw(
        'ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;',
      );
    } else if (dialect === 'mysql') {
      await client.raw(
        'ALTER TABLE `account` MODIFY COLUMN `issuer` varchar(255) NULL;',
      );
    } else {
      throw new Error(
        `Unsupported dialect "${dialect}" for relaxing account.issuer.`,
      );
    }
  },

  // Restoring NOT NULL only succeeds while no self-registered (NULL-issuer)
  // rows exist; once the application has accepted registrations the reverse
  // is not safely possible without backfilling issuer values first.
  async down({ connection }) {
    const client = await connection.client<RawSqlClient>();
    const dialect = connection.dialect;

    // Mirror the up() guard: environments without the authentication plugin's
    // `account` table have nothing to restore.
    try {
      await client.raw('SELECT count(*) FROM "account";');
    } catch {
      return;
    }

    if (dialect === 'sqlite') {
      await client.raw(`
        CREATE TABLE "account_restored" (
          "id" varchar(64) not null,
          "issuer" varchar(255) not null,
          "account_id" varchar(320) not null,
          "provider_id" varchar(128) not null,
          "user_id" varchar(64) not null,
          "access_token" text null,
          "refresh_token" text null,
          "id_token" text null,
          "access_token_expires_at" text null,
          "refresh_token_expires_at" text null,
          "scope" text null,
          "password" text null,
          "created_at" text not null,
          "updated_at" text not null,
          constraint "pk_account" primary key ("id")
        );
      `);
      await client.raw(
        'INSERT INTO "account_restored" SELECT * FROM "account";',
      );
      await client.raw('DROP TABLE "account";');
      await client.raw('ALTER TABLE "account_restored" RENAME TO "account";');
      await client.raw(
        'CREATE UNIQUE INDEX "uq_account_issuer_account" on "account" ("issuer", "account_id");',
      );
      await client.raw(
        'CREATE INDEX "idx_account_user" on "account" ("user_id");',
      );
    } else if (dialect === 'postgres') {
      await client.raw(
        'ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;',
      );
    } else if (dialect === 'mysql') {
      await client.raw(
        'ALTER TABLE `account` MODIFY COLUMN `issuer` varchar(255) NOT NULL;',
      );
    }
  },
});

interface RawSqlClient {
  raw(sql: string, ...bindings: unknown[]): Promise<unknown>;
}

export default migration;
