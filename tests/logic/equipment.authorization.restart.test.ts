// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authorizationToken } from '@nocobase/app-plugin-authorization/server';

import {
  ApiTestContext,
  asRecord,
  bootTestApp,
  EMPLOYEE_EMAIL,
  EMPLOYEE_PASSWORD,
} from '../helpers/test-app.js';

/**
 * Regression coverage for the page-access provisioning fix.
 *
 * The application's client route guard resolves every authenticated route to
 * `can({ type: 'page', id: routeName }, 'access')` against the
 * /api/authz/permissions snapshot. A regular user (employee) must therefore
 * hold `page: equipment` and `page: equipment-borrow-records` grants, or the
 * UI shows "Access denied" even though the data APIs answer 200.
 *
 * Provisioning runs on every server boot and must also repair databases that
 * were provisioned before the page grants existed, so this boots a second
 * server against the same database after stripping the grants.
 */

let ctx: ApiTestContext | undefined;
let employeeCookie: string;

interface SnapshotPermission {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly string[];
}

function pageActions(
  permissions: readonly SnapshotPermission[],
  id: string,
): readonly string[] | undefined {
  return permissions.find(
    (permission) =>
      permission.resource.type === 'page' && permission.resource.id === id,
  )?.actions;
}

async function employeePermissionSnapshot(): Promise<
  readonly SnapshotPermission[]
> {
  const response = await ctx!.api('/authz/permissions', {
    cookie: employeeCookie,
  });
  expect(response.status).toBe(200);
  const data = asRecord(asRecord(response.body).data);
  return data.permissions as readonly SnapshotPermission[];
}

async function expectEmployeePageGrants(): Promise<void> {
  const permissions = await employeePermissionSnapshot();
  expect(pageActions(permissions, 'equipment')).toContain('access');
  expect(pageActions(permissions, 'equipment-borrow-records')).toContain(
    'access',
  );
}

beforeAll(async () => {
  ctx = await bootTestApp();
  employeeCookie = await ctx.signUp(
    'Restart Employee',
    EMPLOYEE_EMAIL,
    EMPLOYEE_PASSWORD,
  );
}, 120_000);

afterAll(async () => {
  await ctx?.close();
}, 30_000);

describe('equipment page access provisioning', () => {
  it('grants the employee page access on a fresh database', async () => {
    await expectEmployeePageGrants();
  });

  it('re-adds page grants when booting against a database from an older build', async () => {
    // Simulate a database provisioned before the page grants existed: strip
    // every `page` grant from the employee permission set.
    const app = ctx!.application;
    const authorization = app.container.resolve(authorizationToken);
    const existing = await authorization.permissionSets.get('equipment-user');
    expect(existing).toBeDefined();
    const stripped = (existing?.grants ?? []).filter(
      (grant) => grant.resource.type !== 'page',
    );
    await authorization.permissionSets.update('equipment-user', {
      key: 'equipment-user',
      title: existing?.title,
      grants: stripped,
    });

    // Close the running server, then boot a fresh one against the same
    // database. Boot-time provisioning must reconcile the permission set and
    // restore the page grants.
    const configPath = ctx!.configPath;
    await ctx!.close();
    ctx = undefined;
    const restarted = await bootTestApp(configPath);
    try {
      // The session cookie is persisted in the database, so it stays valid
      // across the restart.
      const permissions = await (async () => {
        const response = await restarted.api('/authz/permissions', {
          cookie: employeeCookie,
        });
        expect(response.status).toBe(200);
        const data = asRecord(asRecord(response.body).data);
        return data.permissions as readonly SnapshotPermission[];
      })();
      expect(pageActions(permissions, 'equipment')).toContain('access');
      expect(pageActions(permissions, 'equipment-borrow-records')).toContain(
        'access',
      );
    } finally {
      await restarted.close();
    }
  });
});
