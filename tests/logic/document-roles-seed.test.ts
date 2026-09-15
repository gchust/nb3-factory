// @vitest-environment node
// The seed reads and writes real tables through the database manager, so it runs in Node rather than jsdom.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import documentRolesSeed from '../../database/main/seeds/202609140002_seed_document_library_roles.js';

interface PermissionSetRecord {
  readonly key: string;
  readonly grants: string;
}

interface GrantRecord {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly { readonly action: string }[];
}

async function createAuthorizationTables(manager: DatabaseManager) {
  const builder = manager.builder('main');
  await builder.createCollection(
    'authorizationPermissionSets',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('key', { length: 255 }).notNull();
      collection.string('title', { length: 255 }).nullable();
      collection.json('grants').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id');
      collection.unique('key');
    },
  );
  await builder.createCollection(
    'authorizationPermissionSetAssignments',
    (collection) => {
      collection.string('id', { length: 255 }).notNull();
      collection.string('subjectType', { length: 64 }).notNull();
      collection.string('subjectId', { length: 255 }).notNull();
      collection.string('permissionSetKey', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id');
    },
  );
}

describe('document library roles seed', () => {
  let directory: string;
  let manager: DatabaseManager;

  const runSeed = async () => {
    await documentRolesSeed.run({
      query: manager.query('main'),
      connection: manager.connection('main'),
    });
  };

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'nb3-document-seed-'));
    manager = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: path.join(directory, 'test.sqlite'),
          schemaManagement: 'managed',
        },
      },
    });
    await createAuthorizationTables(manager);
    const now = new Date();
    await manager
      .query('main')
      .insertInto('authorizationPermissionSets')
      .values({
        id: 'admin-set',
        key: 'system-administrator',
        title: 'System administrator',
        grants: JSON.stringify([
          {
            resource: { type: 'page', id: '*' },
            actions: [{ action: 'access' }],
          },
        ]),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  });

  afterEach(async () => {
    await manager.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  const loadSets = async (): Promise<Map<string, GrantRecord[]>> => {
    const rows = await manager
      .query('main')
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .execute();
    return new Map(
      (rows as unknown as PermissionSetRecord[]).map((row) => [
        row.key,
        JSON.parse(row.grants) as GrantRecord[],
      ]),
    );
  };

  const actionsFor = (grants: GrantRecord[], id: string): string[] => {
    const grant = grants.find(
      (candidate) =>
        candidate.resource.type === 'database.collection' &&
        candidate.resource.id === id,
    );
    return (grant?.actions ?? []).map((action) => action.action).sort();
  };

  it('installs the three roles, the visitor baseline and the administrator grant', async () => {
    await runSeed();
    const sets = await loadSets();

    expect([...sets.keys()].sort()).toEqual([
      'archivist',
      'engineer',
      'system-administrator',
      'visitor',
    ]);
    expect(actionsFor(sets.get('visitor') ?? [], 'main.documents')).toEqual([
      'read',
    ]);
    expect(actionsFor(sets.get('engineer') ?? [], 'main.documents')).toEqual([
      'download',
      'read',
    ]);
    expect(actionsFor(sets.get('archivist') ?? [], 'main.documents')).toEqual([
      'create',
      'delete',
      'download',
      'read',
      'update',
    ]);
    // The administrator keeps its existing page grant and gains the ledger actions.
    const admin = sets.get('system-administrator') ?? [];
    expect(admin.some((grant) => grant.resource.type === 'page')).toBe(true);
    expect(actionsFor(admin, 'main.documents')).toEqual([
      'create',
      'delete',
      'download',
      'read',
      'update',
    ]);

    const assignments = await manager
      .query('main')
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['subjectType', 'subjectId', 'permissionSetKey'])
      .execute();
    expect(assignments).toEqual([
      {
        subjectType: 'authenticated',
        subjectId: '*',
        permissionSetKey: 'visitor',
      },
    ]);
  });

  it('is idempotent: a second run changes nothing', async () => {
    await runSeed();
    const before = await loadSets();
    const assignmentsBefore = await manager
      .query('main')
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['id'])
      .execute();

    await runSeed();

    const after = await loadSets();
    const assignmentsAfter = await manager
      .query('main')
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['id'])
      .execute();
    expect(after).toEqual(before);
    expect(assignmentsAfter).toEqual(assignmentsBefore);
    expect(
      actionsFor(after.get('system-administrator') ?? [], 'main.documents'),
    ).toHaveLength(5);
  });

  it('leaves an existing role alone, so administrator edits survive a re-run', async () => {
    await runSeed();
    const edited = JSON.stringify([
      {
        resource: { type: 'page', id: 'documents' },
        actions: [{ action: 'access' }],
      },
    ]);
    await manager
      .query('main')
      .updateTable('authorizationPermissionSets')
      .set({ grants: edited, updatedAt: new Date() })
      .where('key', '=', 'engineer')
      .execute();

    await runSeed();

    const sets = await loadSets();
    expect(JSON.stringify(sets.get('engineer'))).toBe(edited);
  });
});
