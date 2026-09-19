// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseManager } from '@nocobase/db';

import {
  createAuthenticationTables,
  createTestDatabase,
  migrate,
  runDemoSeed,
} from '../helpers/expense-database.js';

describe('expense demo seed', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createTestDatabase();
    await createAuthenticationTables(database);
    await migrate(database);
    const now = new Date('2026-08-01T00:00:00.000Z');
    await database
      .query()
      .insertInto('user')
      .values({
        id: 'admin-user',
        name: 'nocobase',
        username: 'nocobase',
        email: 'admin@nocobase.com',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await database
      .query()
      .insertInto('authorizationPermissionSets')
      .values({
        id: 'system-administrator',
        key: 'system-administrator',
        title: 'System administrator',
        grants: '[]',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await database
      .query()
      .insertInto('authorizationPermissionSetAssignments')
      .values({
        id: 'user:admin-user:system-administrator',
        subjectType: 'user',
        subjectId: 'admin-user',
        permissionSetKey: 'system-administrator',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function counts() {
    const query = database.query();
    const [departments, categories, employees, reports, payments, users] =
      await Promise.all([
        query.selectFrom('expenseDepartments').select('id').execute(),
        query.selectFrom('expenseCategories').select('id').execute(),
        query.selectFrom('expenseEmployees').select('id').execute(),
        query.selectFrom('expenseReports').select('id').execute(),
        query.selectFrom('expensePayments').select('id').execute(),
        query
          .selectFrom('user')
          .select('id')
          .where('username', '!=', 'nocobase')
          .execute(),
      ]);
    const statuses = await query
      .selectFrom('expenseReports')
      .select('status')
      .execute();
    return {
      departments: departments.length,
      categories: categories.length,
      employees: employees.length,
      reports: reports.length,
      payments: payments.length,
      demoUsers: users.length,
      statuses: statuses.map((row) => String(row.status)).sort(),
    };
  }

  it('creates the fixed demo data set and is idempotent', async () => {
    await runDemoSeed(database);
    const first = await counts();
    expect(first.departments).toBe(2);
    expect(first.categories).toBe(6);
    expect(first.demoUsers).toBe(7);
    expect(first.employees).toBe(8);
    expect(first.reports).toBe(12);
    expect(first.payments).toBe(1);
    expect(first.statuses).toEqual([
      'approved',
      'approved',
      'approved',
      'draft',
      'draft',
      'draft',
      'paid',
      'rejected',
      'rejected',
      'submitted',
      'submitted',
      'submitted',
    ]);

    await runDemoSeed(database);
    expect(await counts()).toEqual(first);
  });

  it('creates credential accounts and a global page-access permission set', async () => {
    await runDemoSeed(database);
    const query = database.query();
    const account = await query
      .selectFrom('account')
      .select(['password'])
      .where('issuer', '=', 'local:credential')
      .executeTakeFirst();
    expect(typeof account?.password).toBe('string');
    expect((account?.password as string).length).toBeGreaterThan(0);

    const permissionSet = await query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .where('key', '=', 'expense-pages')
      .executeTakeFirst();
    expect(permissionSet).toBeTruthy();
    const grants =
      typeof permissionSet?.grants === 'string'
        ? JSON.parse(permissionSet.grants)
        : permissionSet?.grants;
    expect(
      grants.map((grant: { resource: { id: string } }) => grant.resource.id),
    ).toEqual([
      'expenses',
      'expenseApprovals',
      'expenseFinance',
      'expenseStatistics',
    ]);

    const assignment = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['subjectType', 'permissionSetKey'])
      .where('id', '=', 'authenticated:*:expense-pages')
      .executeTakeFirst();
    expect(assignment).toMatchObject({
      subjectType: 'authenticated',
      permissionSetKey: 'expense-pages',
    });
  });
});
