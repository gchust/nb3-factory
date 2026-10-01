// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  databaseManagerToken,
  type DatabaseManager,
  type MigrationContext,
} from '@nocobase/db';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';
import migration from '../../database/main/migrations/202609290001_create_crm_collections.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const COLLECTIONS = ['customers', 'contacts', 'opportunities'] as const;

let cleanupDir = '';
let server: StandaloneServer | undefined;
let database: DatabaseManager;

describe('CRM migration', () => {
  beforeAll(async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), 'nocobase-crm-migration-test-'),
    );
    cleanupDir = directory;

    const configFile = path.join(directory, 'config.json');
    writeFileSync(
      configFile,
      JSON.stringify({
        auth: { secret: 'test-auth-secret-at-least-32-characters' },
        database: {
          default: 'main',
          connections: {
            main: {
              dialect: 'sqlite',
              filename: path.join(directory, 'database.sqlite'),
            },
          },
          // Apply on startup, the way the application does, so the assertions below
          // run against the same source that ships.
          migrations: { autoRun: true },
          seeds: { autoRun: false },
        },
        hub: { host: { enabled: false } },
      }),
    );

    const sourceRoot = path.resolve(import.meta.dirname, '../..');
    server = await createStandaloneServer({
      env: {
        DB_DIALECT: 'sqlite',
        DB_MIGRATIONS_AUTO_RUN: 'true',
        DB_SEEDS_AUTO_RUN: 'false',
        APP_CONFIG_FILE: configFile,
      },
      paths: {
        rootDir: sourceRoot,
        serverDir: path.join(sourceRoot, 'server'),
        databaseDir: path.join(sourceRoot, 'database'),
        clientDir: path.join(sourceRoot, 'dist/client'),
        storageDir: path.join(sourceRoot, 'storage'),
      },
    });

    database = server.application.container.resolve(databaseManagerToken);
  });

  afterAll(async () => {
    await server?.close();
    rmSync(cleanupDir, { recursive: true, force: true });
  });

  // The migration only touches the builder, so a context carrying one is enough to
  // run its `up` and `down` directly. Going through the migrator would roll the
  // startup batch back as a whole, which also holds plugin migrations this file
  // does not load.
  function context(): MigrationContext {
    return { builder: database.builder('main') } as unknown as MigrationContext;
  }

  it('creates the three collections from one migration', async () => {
    const builder = database.builder('main');
    for (const collection of COLLECTIONS) {
      expect(await builder.hasCollection(collection)).toBe(true);
    }

    const contacts = await database.collections('main').get('contacts');
    expect(contacts?.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining(['name', 'phone', 'email', 'customerId']),
    );
    const opportunities = await database
      .collections('main')
      .get('opportunities');
    expect(opportunities?.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining(['name', 'customerId', 'amount', 'stage']),
    );
  });

  it('drops every table on down and creates them again on up', async () => {
    const builder = database.builder('main');

    await migration.down?.(context());
    const inspector = database.connection('main').schemaInspector;
    for (const collection of COLLECTIONS) {
      expect(await builder.hasCollection(collection)).toBe(false);
      // The metadata and the physical table both go: a `down` that only forgot the
      // table would leave the next `up` failing on an existing relation.
      expect(
        await inspector.getPhysicalCollection({ tableName: collection }),
      ).toBeUndefined();
    }
    // Down is the explicit reverse in safe dependency order: children first.
    expect(await database.collections('main').get('customers')).toBeUndefined();

    await migration.up(context());
    for (const collection of COLLECTIONS) {
      expect(await builder.hasCollection(collection)).toBe(true);
      expect(
        await inspector.getPhysicalCollection({ tableName: collection }),
      ).toBeDefined();
    }

    const contacts = await database.collections('main').get('contacts');
    expect(contacts?.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining(['name', 'phone', 'email', 'customerId']),
    );
  });
});
