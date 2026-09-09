import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createAppMigrator,
  createAppSeeder,
} from '@nocobase/app-server/database';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const migrationsDirectory = path.resolve(
  import.meta.dirname,
  '../../database/migrations',
);
const seedsDirectory = path.resolve(
  import.meta.dirname,
  '../../database/seeds',
);

interface PageGrant {
  resource?: { type?: string; id?: string };
  actions?: Array<{ action?: string }>;
}

describe('team todos page access seed', () => {
  let database: DatabaseManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'team-todos-page-seed-'));
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: path.join(tempDir, 'test.sqlite'),
        },
      },
    });
    await database.connect();

    await createAppMigrator({
      database,
      config: {
        directory: migrationsDirectory,
        packageName: 'nb3-factory',
        autoRun: true,
      },
    }).latest();

    // The authorization plugin owns the permission-set tables; the isolated
    // app migrator above does not run plugin migrations. Create the tables
    // and the `default-pages` set exactly as the plugin's migration does.
    await database
      .connection()
      .builder.createCollection('authorizationPermissionSets', (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('key', { length: 255 }).notNull();
        collection.string('title', { length: 255 }).nullable();
        collection.json('grants').notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.primary('id', {
          name: 'pk_authorization_permission_sets',
        });
        collection.unique('key', {
          name: 'uq_authorization_permission_sets_key',
        });
      });
    await database
      .connection()
      .builder.createCollection(
        'authorizationPermissionSetAssignments',
        (collection) => {
          collection.string('id', { length: 255 }).notNull();
          collection.string('subjectType', { length: 64 }).notNull();
          collection.string('subjectId', { length: 255 }).notNull();
          collection.string('permissionSetKey', { length: 255 }).notNull();
          collection.datetime('createdAt').notNull();
          collection.datetime('updatedAt').notNull();
          collection.primary('id', {
            name: 'pk_authorization_permission_set_assignments',
          });
          collection.unique(['subjectType', 'subjectId', 'permissionSetKey'], {
            name: 'uq_authorization_permission_set_assignments_subject_set',
          });
        },
      );

    const now = new Date();
    await database
      .query()
      .insertInto('authorizationPermissionSets')
      .values({
        id: crypto.randomUUID(),
        key: 'default-pages',
        title: 'Default pages',
        grants: JSON.stringify([
          {
            resource: { type: 'page', id: 'home' },
            actions: [{ action: 'access' }],
          },
        ]),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await database
      .query()
      .insertInto('authorizationPermissionSetAssignments')
      .values({
        id: 'authenticated:*:default-pages',
        subjectType: 'authenticated',
        subjectId: '*',
        permissionSetKey: 'default-pages',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  });

  afterEach(async () => {
    await database.destroy();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createSeeder() {
    return createAppSeeder({
      database,
      config: {
        directory: seedsDirectory,
        packageName: 'nb3-factory',
        autoRun: true,
      },
    });
  }

  async function defaultPagesGrants(): Promise<PageGrant[]> {
    const row = await database
      .query()
      .selectFrom('authorizationPermissionSets')
      .select('grants')
      .where('key', '=', 'default-pages')
      .executeTakeFirst();
    if (!row) {
      return [];
    }
    const value = row.grants;
    if (Array.isArray(value)) {
      return value as PageGrant[];
    }
    return typeof value === 'string' ? (JSON.parse(value) as PageGrant[]) : [];
  }

  it('grants the team-todos page to the default-pages permission set', async () => {
    const result = await createSeeder().run();
    expect(result.status).toBe('completed');
    expect(result.executed).toContain(
      '202609090004_grant_team_todos_page_access',
    );

    const grants = await defaultPagesGrants();
    const teamTodos = grants.find(
      (grant) =>
        grant.resource?.type === 'page' && grant.resource.id === 'team-todos',
    );
    expect(teamTodos).toBeDefined();
    expect(teamTodos?.actions).toContainEqual({ action: 'access' });

    // The home page grant must be preserved.
    const home = grants.find(
      (grant) =>
        grant.resource?.type === 'page' && grant.resource.id === 'home',
    );
    expect(home).toBeDefined();
  });

  it('is idempotent: a second run adds no duplicate grant', async () => {
    await createSeeder().run();
    const result = await createSeeder().run();
    expect(result.status).toBe('completed');

    const grants = await defaultPagesGrants();
    const teamTodosGrants = grants.filter(
      (grant) =>
        grant.resource?.type === 'page' && grant.resource.id === 'team-todos',
    );
    expect(teamTodosGrants).toHaveLength(1);
  });

  it('is a no-op when the default-pages set is missing', async () => {
    await database
      .query()
      .deleteFrom('authorizationPermissionSetAssignments')
      .where('permissionSetKey', '=', 'default-pages')
      .execute();
    await database
      .query()
      .deleteFrom('authorizationPermissionSets')
      .where('key', '=', 'default-pages')
      .execute();

    const result = await createSeeder().run();
    expect(result.status).toBe('completed');
    expect(await defaultPagesGrants()).toEqual([]);
  });
});
