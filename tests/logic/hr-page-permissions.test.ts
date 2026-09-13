import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, describe, expect, it } from 'vitest';

import pagePermissionsSeed from '../../database/main/seeds/202609130103_seed_hr_page_permissions.js';

interface Subject {
  readonly type: string;
  readonly id: string;
}

interface Grant {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly { readonly action: string }[];
}

/** In-memory SQLite with the authorization tables the seed reads and writes. */
async function createAuthorizationDatabase(): Promise<DatabaseManager> {
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: ':memory:',
        schemaManagement: 'managed',
      },
    },
  });
  await database.connect();
  const builder = database.builder();
  await builder.createCollection(
    'authorizationPermissionSets',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('key', { length: 255 }).notNull();
      collection.string('title', { length: 255 }).nullable();
      collection.json('grants').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_authorization_permission_sets' });
      collection.unique('key', {
        name: 'uq_authorization_permission_sets_key',
      });
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
      collection.primary('id', {
        name: 'pk_authorization_permission_set_assignments',
      });
    },
  );
  return database;
}

async function runSeed(database: DatabaseManager): Promise<void> {
  await pagePermissionsSeed.run({
    query: database.query(),
    connection: database.connection(),
  } as never);
}

/**
 * Mirrors the authorization permission-set resolution the client relies on:
 * a subject holds every grant from every permission set assigned to it, and a
 * grant matches when the resource type and id line up (`*` id is a wildcard).
 */
async function canAccessPage(
  database: DatabaseManager,
  subjects: readonly Subject[],
  pageId: string,
): Promise<boolean> {
  const assignments = await database
    .query()
    .selectFrom('authorizationPermissionSetAssignments')
    .select(['subjectType', 'subjectId', 'permissionSetKey'])
    .execute();
  const keys = new Set<string>();
  for (const assignment of assignments) {
    const match = subjects.some(
      (subject) =>
        subject.type === String(assignment.subjectType) &&
        subject.id === String(assignment.subjectId),
    );
    if (match) keys.add(String(assignment.permissionSetKey));
  }
  if (keys.size === 0) return false;
  const sets = await database
    .query()
    .selectFrom('authorizationPermissionSets')
    .select(['key', 'grants'])
    .where('key', 'in', [...keys])
    .execute();
  return sets.some((set) =>
    parseGrants(set.grants).some(
      (grant) =>
        grant.resource.type === 'page' &&
        (grant.resource.id === '*' || grant.resource.id === pageId) &&
        grant.actions.some(({ action }) => action === 'access'),
    ),
  );
}

function parseGrants(value: unknown): readonly Grant[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  return (parsed ?? []) as readonly Grant[];
}

describe('HR page permissions seed', () => {
  let database: DatabaseManager | undefined;

  afterEach(async () => {
    await database?.destroy();
    database = undefined;
  });

  it('lets a self-registered employee reach their leave and overtime pages', async () => {
    database = await createAuthorizationDatabase();
    await runSeed(database);

    // A signed-in account is the `authenticated:*` subject, which the seed
    // wires to the employee set.
    const employee: Subject = { type: 'authenticated', id: '*' };
    await expect(
      canAccessPage(database, [employee], 'hrLeaveRequests'),
    ).resolves.toBe(true);
    await expect(
      canAccessPage(database, [employee], 'hrOvertimeRequests'),
    ).resolves.toBe(true);

    // The employee must not gain management pages.
    await expect(
      canAccessPage(database, [employee], 'hrEmployees'),
    ).resolves.toBe(false);
    await expect(
      canAccessPage(database, [employee], 'hrDepartments'),
    ).resolves.toBe(false);
    await expect(
      canAccessPage(database, [employee], 'hrApprovals'),
    ).resolves.toBe(false);
    await expect(
      canAccessPage(database, [employee], 'hrStatistics'),
    ).resolves.toBe(false);
  });

  it('grants managers approvals and HR every HR page', async () => {
    database = await createAuthorizationDatabase();
    await runSeed(database);

    const employee: Subject = { type: 'authenticated', id: '*' };
    const manager: Subject = { type: 'user', id: 'mgr-1' };
    const hr: Subject = { type: 'user', id: 'hr-1' };

    await database
      .query()
      .insertInto('authorizationPermissionSetAssignments')
      .values({
        id: 'user:mgr-1:department-manager',
        subjectType: 'user',
        subjectId: 'mgr-1',
        permissionSetKey: 'department-manager',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    await database
      .query()
      .insertInto('authorizationPermissionSetAssignments')
      .values({
        id: 'user:hr-1:hr',
        subjectType: 'user',
        subjectId: 'hr-1',
        permissionSetKey: 'hr',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();

    await expect(
      canAccessPage(database, [employee, manager], 'hrApprovals'),
    ).resolves.toBe(true);
    await expect(
      canAccessPage(database, [employee, manager], 'hrEmployees'),
    ).resolves.toBe(false);

    for (const page of [
      'hrEmployees',
      'hrDepartments',
      'hrLeaveRequests',
      'hrOvertimeRequests',
      'hrApprovals',
      'hrStatistics',
    ]) {
      await expect(canAccessPage(database, [employee, hr], page)).resolves.toBe(
        true,
      );
    }
  });

  it('is idempotent and preserves unrelated grants', async () => {
    database = await createAuthorizationDatabase();
    await runSeed(database);
    // Simulate a pre-existing database grant on the hr set.
    await database
      .query()
      .updateTable('authorizationPermissionSets')
      .set({
        grants: JSON.stringify([
          {
            resource: { type: 'database.collection', id: 'main.hrEmployees' },
            actions: [{ action: 'read' }],
          },
        ]),
      })
      .where('key', '=', 'hr')
      .execute();

    await runSeed(database);
    await runSeed(database);

    const rows = await database
      .query()
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .where('key', '=', 'hr')
      .executeTakeFirstOrThrow();
    const grants = parseGrants(rows.grants);
    expect(
      grants.filter(
        (grant) =>
          grant.resource.type === 'page' && grant.resource.id === 'hrEmployees',
      ),
    ).toHaveLength(1);
    expect(
      grants.some(
        (grant) =>
          grant.resource.type === 'database.collection' &&
          grant.resource.id === 'main.hrEmployees',
      ),
    ).toBe(true);
  });
});
