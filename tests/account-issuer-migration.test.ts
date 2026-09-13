import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createDatabaseManager,
  defineMigration,
  type DatabaseManager,
  type MigrationDefinition,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import addIssuerDefault from '../database/main/migrations/202609130005_add_account_issuer_default.js';

/**
 * The Authentication plugin owns the `account` table. This mirror states the
 * exact precondition the repair migration targets: `issuer` is NOT NULL and has
 * no default, which is what the plugin's own migration creates.
 */
const createAccountTable: MigrationDefinition = defineMigration({
  name: 'test_create_account_table',
  async up({ builder }) {
    await builder.createCollection('account', (collection) => {
      collection.string('id', { length: 64, nullable: false }).primary();
      collection.string('issuer', { length: 255, nullable: false });
      collection.string('accountId', { length: 320, nullable: false });
      collection.string('providerId', { length: 128, nullable: false });
      collection.string('userId', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('account');
  },
});

describe('account issuer default migration', () => {
  let manager: DatabaseManager;
  let directory: string;

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'account-issuer-'));
    manager = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: path.join(directory, 'database.sqlite'),
        },
      },
    });
    await manager.connect('main');
  });

  afterEach(async () => {
    await manager.destroy();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const migrationContext = () =>
    ({ builder: manager.builder('main') }) as never;

  /** Inserts like Better Auth's credential sign-up: without `issuer`. */
  async function insertWithoutIssuer(id: string): Promise<void> {
    const now = new Date();
    await manager
      .query('main')
      .insertInto('account')
      .values({
        id,
        accountId: id,
        providerId: 'credential',
        userId: id,
        createdAt: now,
        updatedAt: now,
      } as never)
      .execute();
  }

  async function issuerOf(id: string): Promise<string | undefined> {
    const row = await manager
      .query('main')
      .selectFrom('account')
      .select(['issuer'])
      .where('id', '=', id)
      .executeTakeFirst();
    return (row as { issuer?: string } | undefined)?.issuer;
  }

  it('leaves databases without the authentication tables untouched', async () => {
    await expect(
      addIssuerDefault.up(migrationContext()),
    ).resolves.toBeUndefined();
    await expect(
      addIssuerDefault.down(migrationContext()),
    ).resolves.toBeUndefined();
  });

  it('defaults issuer for a credential account and reverses on down', async () => {
    await createAccountTable.up(migrationContext());

    // The precondition: an omitted issuer fails before the repair.
    await expect(insertWithoutIssuer('before')).rejects.toThrow(/issuer/);

    await addIssuerDefault.up(migrationContext());
    await insertWithoutIssuer('after');
    expect(await issuerOf('after')).toBe('local:credential');

    await addIssuerDefault.down(migrationContext());
    await expect(insertWithoutIssuer('rolled-back')).rejects.toThrow(/issuer/);
    // The repaired row is untouched by the rollback.
    expect(await issuerOf('after')).toBe('local:credential');
  });
});
