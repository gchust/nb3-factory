import { createAppAuthorization } from '@nocobase/app-plugin-authorization';
import { createMigrationContext, type DatabaseManager } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

import { provisionAssetAuthorization } from '../server/providers/asset-service.js';
import { createTestDatabase } from './helpers/asset-test-db.js';

/**
 * Creates the minimal authentication and authorization tables the provisioning
 * logic reads and writes. Mirrors the plugin migrations so the test exercises
 * the real `provisionAssetAuthorization` code path against a real database.
 */
async function createAuthorizationTables(database: DatabaseManager) {
  const { builder } = createMigrationContext(database.connection());
  await builder.createCollection('user', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('name', { length: 255 }).notNull();
    collection.string('username', { length: 255 }).nullable();
    collection.string('email', { length: 320 }).notNull();
    collection.boolean('emailVerified').notNull().defaultTo(false);
    collection.text('image').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id', { name: 'pk_user' });
    collection.unique('username', { name: 'uq_user_username' });
    collection.unique('email', { name: 'uq_user_email' });
  });
  await builder.createCollection(
    'authorizationPermissionSets',
    (collection) => {
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
      collection.unique(['subjectType', 'subjectId', 'permissionSetKey'], {
        name: 'uq_authorization_permission_set_assignments_subject_set',
      });
    },
  );
  await builder.createCollection(
    'authorizationDefaultAccessRules',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('resourceType', { length: 255 }).notNull();
      collection.string('resourceId', { length: 255 }).notNull();
      collection.json('actions').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', {
        name: 'pk_authorization_default_access_rules',
      });
      collection.unique(['resourceType', 'resourceId'], {
        name: 'uq_authorization_default_access_resource',
      });
    },
  );
  await builder.createCollection(
    'authorizationDefaultAccessRuleRecords',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('defaultAccessRuleId', { length: 64 }).notNull();
      collection.string('action', { length: 255 }).notNull();
      collection.string('recordId', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_authz_default_access_records' });
      collection.unique(['defaultAccessRuleId', 'action', 'recordId'], {
        name: 'uq_authz_default_records_rule_action_record',
      });
      collection.index('defaultAccessRuleId', {
        name: 'idx_authz_default_records_rule',
      });
    },
  );
  await builder.createCollection('authorizationSharingRules', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('key', { length: 255 }).notNull();
    collection.string('title', { length: 255 }).nullable();
    collection.string('resourceType', { length: 255 }).notNull();
    collection.string('resourceId', { length: 255 }).notNull();
    collection.json('actions').notNull();
    collection.text('reason').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id', { name: 'pk_authorization_sharing_rules' });
    collection.unique('key', {
      name: 'uq_authorization_sharing_rules_key',
    });
    collection.index(['resourceType', 'resourceId'], {
      name: 'idx_authorization_sharing_rules_resource',
    });
  });
  await builder.createCollection(
    'authorizationSharingRuleRecords',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('sharingRuleId', { length: 64 }).notNull();
      collection.string('action', { length: 255 }).notNull();
      collection.string('recordId', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', {
        name: 'pk_authorization_sharing_rule_records',
      });
      collection.unique(['sharingRuleId', 'action', 'recordId'], {
        name: 'uq_authz_sharing_records_rule_action_record',
      });
      collection.index('sharingRuleId', {
        name: 'idx_authorization_sharing_rule_records_rule',
      });
    },
  );
  await builder.createCollection(
    'authorizationSharingRuleAssignments',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('sharingRuleId', { length: 64 }).notNull();
      collection.string('subjectType', { length: 255 }).notNull();
      collection.string('subjectId', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_authz_sharing_assignments' });
      collection.unique(['sharingRuleId', 'subjectType', 'subjectId'], {
        name: 'uq_authz_sharing_assignments_subject',
      });
      collection.index('sharingRuleId', {
        name: 'idx_authz_sharing_assignments_rule',
      });
    },
  );
  await builder.createCollection(
    'authorizationRestrictionRules',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('key', { length: 255 }).notNull();
      collection.string('title', { length: 255 }).nullable();
      collection.string('resourceType', { length: 255 }).notNull();
      collection.string('resourceId', { length: 255 }).notNull();
      collection.json('actions').notNull();
      collection.text('reason').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', {
        name: 'pk_authorization_restriction_rules',
      });
      collection.unique('key', {
        name: 'uq_authorization_restriction_rules_key',
      });
      collection.index(['resourceType', 'resourceId'], {
        name: 'idx_authorization_restriction_rules_resource',
      });
    },
  );
  await builder.createCollection(
    'authorizationRestrictionRuleRecords',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('restrictionRuleId', { length: 64 }).notNull();
      collection.string('action', { length: 255 }).notNull();
      collection.string('recordId', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_authz_restriction_records' });
      collection.unique(['restrictionRuleId', 'action', 'recordId'], {
        name: 'uq_authz_restrict_records_rule_action_record',
      });
      collection.index('restrictionRuleId', {
        name: 'idx_authz_restrict_records_rule',
      });
    },
  );
  await builder.createCollection(
    'authorizationRestrictionRuleAssignments',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('restrictionRuleId', { length: 64 }).notNull();
      collection.string('subjectType', { length: 255 }).notNull();
      collection.string('subjectId', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_authz_restrict_assignments' });
      collection.unique(['restrictionRuleId', 'subjectType', 'subjectId'], {
        name: 'uq_authz_restrict_assignments_subject',
      });
      collection.index('restrictionRuleId', {
        name: 'idx_authz_restrict_assignments_rule',
      });
    },
  );
}

async function insertAdminUser(database: DatabaseManager) {
  const now = new Date();
  await database
    .query()
    .insertInto('user')
    .values({
      id: 'admin-user-id',
      name: 'Admin',
      username: 'nocobase',
      email: 'admin@nocobase.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

interface GrantRecord {
  resource: { type: string; id: string };
  actions: Array<{ action: string }>;
}

async function readGrants(
  database: DatabaseManager,
  key: string,
): Promise<GrantRecord[]> {
  const row = await database
    .query()
    .selectFrom('authorizationPermissionSets')
    .select('grants')
    .where('key', '=', key)
    .executeTakeFirst();
  if (!row) return [];
  const parsed =
    typeof row.grants === 'string' ? JSON.parse(row.grants) : row.grants;
  return parsed as GrantRecord[];
}

describe('asset authorization provisioning', () => {
  it('grants page access and claim/return to every signed-in user', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      await createAuthorizationTables(database);
      await insertAdminUser(database);

      const authz = createAppAuthorization({
        connection: database.connection(),
      });
      await provisionAssetAuthorization(authz, database);

      // The employee set (assigned to authenticated:*) must open the business
      // pages to regular users, not just the database collections.
      const employeeGrants = await readGrants(database, 'it-asset-employee');
      const pageIds = employeeGrants
        .filter((grant) => grant.resource.type === 'page')
        .map((grant) => grant.resource.id)
        .sort();
      expect(pageIds).toEqual(['assetDetail', 'assetRecords', 'assets']);
      for (const grant of employeeGrants.filter(
        (item) => item.resource.type === 'page',
      )) {
        expect(grant.actions.map((action) => action.action)).toContain(
          'access',
        );
      }

      // The admin set carries the same page grants.
      const adminGrants = await readGrants(database, 'it-asset-admin');
      const adminPageIds = adminGrants
        .filter((grant) => grant.resource.type === 'page')
        .map((grant) => grant.resource.id)
        .sort();
      expect(adminPageIds).toEqual(['assetDetail', 'assetRecords', 'assets']);

      // A regular user (authenticated subject) can open every business page.
      const employeeScope = authz.for({
        principal: { type: 'user', id: 'regular-user-id' },
        subjects: [{ type: 'authenticated', id: '*' }],
      });
      for (const page of ['assets', 'assetRecords', 'assetDetail']) {
        await expect(
          employeeScope.can({
            resource: { type: 'page', id: page },
            action: 'access',
          }),
        ).resolves.toBe(true);
      }

      // The same user can read assets/records and claim/return them. Database
      // grants with record access resolve to a `conditional` decision, so
      // assert the effect is not `deny` rather than `permit`.
      const notDenied = async (
        scope: typeof employeeScope,
        resource: string,
        action: string,
      ) => {
        const decision = await scope.authorize({
          resource: { type: 'database.collection', id: resource },
          action,
        });
        return decision.effect !== 'deny';
      };
      await expect(
        notDenied(employeeScope, 'main.itAssets', 'read'),
      ).resolves.toBe(true);
      await expect(
        notDenied(employeeScope, 'main.itAssets', 'claim'),
      ).resolves.toBe(true);
      await expect(
        notDenied(employeeScope, 'main.itAssets', 'return'),
      ).resolves.toBe(true);
      await expect(
        notDenied(employeeScope, 'main.itAssetRecords', 'read'),
      ).resolves.toBe(true);

      // The default administrator keeps full management access.
      const adminScope = authz.for({
        principal: { type: 'user', id: 'admin-user-id' },
        subjects: [{ type: 'authenticated', id: '*' }],
      });
      await expect(
        notDenied(adminScope, 'main.itAssets', 'create'),
      ).resolves.toBe(true);
      await expect(
        notDenied(adminScope, 'main.itAssets', 'delete'),
      ).resolves.toBe(true);
    } finally {
      await database.destroy();
    }
  });

  it('refreshes an existing employee set with the page grants', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      await createAuthorizationTables(database);
      await insertAdminUser(database);

      // Simulate a database seeded by an earlier build: the employee set
      // exists but only carries database grants, no page grants.
      const now = new Date();
      await database
        .query()
        .insertInto('authorizationPermissionSets')
        .values({
          id: 'employee-set-id',
          key: 'it-asset-employee',
          title: 'IT Asset Employee',
          grants: JSON.stringify([
            {
              resource: {
                type: 'database.collection',
                id: 'main.itAssets',
              },
              actions: [{ action: 'read' }],
            },
          ]),
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      const authz = createAppAuthorization({
        connection: database.connection(),
      });
      await provisionAssetAuthorization(authz, database);

      const employeeGrants = await readGrants(database, 'it-asset-employee');
      const pageIds = employeeGrants
        .filter((grant) => grant.resource.type === 'page')
        .map((grant) => grant.resource.id)
        .sort();
      expect(pageIds).toEqual(['assetDetail', 'assetRecords', 'assets']);
    } finally {
      await database.destroy();
    }
  });
});
