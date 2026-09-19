import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';

import migration from '../../database/main/migrations/202609190001_create_expense_tables.js';
import seed from '../../database/main/seeds/202609190100_seed_expense_demo_data.js';

export function createTestDatabase(): DatabaseManager {
  return createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
}

export async function migrate(database: DatabaseManager): Promise<void> {
  await migration.up({
    builder: database.builder(),
    query: database.query(),
    connection: database.connection(),
  });
}

export async function rollback(database: DatabaseManager): Promise<void> {
  await migration.down?.({
    builder: database.builder(),
    query: database.query(),
    connection: database.connection(),
  });
}

export async function createAuthenticationTables(
  database: DatabaseManager,
): Promise<void> {
  const builder = database.builder();
  // Mirrors the production authentication migrations so tests exercise the same
  // schema the application runs against, including the nullable lifecycle columns
  // and the required `account.issuer` credential-issuer column.
  await builder.createCollection('user', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('name', { length: 255 }).notNull();
    collection.string('username', { length: 255 }).nullable();
    collection.string('email', { length: 320 }).notNull();
    collection.boolean('emailVerified').notNull().defaultTo(false);
    collection.text('image').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.datetime('disabledAt').nullable();
    collection.datetime('deletedAt').nullable();
    collection.string('deletedBy', { length: 64 }).nullable();
    collection.primary('id', { name: 'pk_user_test' });
  });
  await builder.createCollection('account', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('issuer', { length: 255 }).notNull();
    collection.string('accountId', { length: 320 }).notNull();
    collection.string('providerId', { length: 128 }).notNull();
    collection.string('userId', { length: 64 }).notNull();
    collection.text('accessToken').nullable();
    collection.text('refreshToken').nullable();
    collection.text('idToken').nullable();
    collection.datetime('accessTokenExpiresAt').nullable();
    collection.datetime('refreshTokenExpiresAt').nullable();
    collection.text('scope').nullable();
    collection.text('password').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id', { name: 'pk_account_test' });
    collection.unique(['issuer', 'accountId'], {
      name: 'uq_account_issuer_account_test',
    });
  });
  await builder.createCollection('session', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.datetime('expiresAt').notNull();
    collection.string('token', { length: 255 }).notNull();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.string('ipAddress', { length: 128 }).nullable();
    collection.text('userAgent').nullable();
    collection.string('userId', { length: 64 }).notNull();
    collection.primary('id', { name: 'pk_session_test' });
    collection.unique('token', { name: 'uq_session_token_test' });
  });
  await builder.createCollection(
    'authorizationPermissionSets',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('key', { length: 128 }).notNull();
      collection.string('title', { length: 255 }).nullable();
      collection.json('grants').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_permission_sets_test' });
    },
  );
  await builder.createCollection(
    'authorizationPermissionSetAssignments',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('subjectType', { length: 32 }).notNull();
      collection.string('subjectId', { length: 64 }).notNull();
      collection.string('permissionSetKey', { length: 128 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_permission_assignments_test' });
    },
  );
}

export async function runDemoSeed(database: DatabaseManager): Promise<void> {
  await seed.run({
    query: database.query(),
    connection: database.connection(),
  });
}

export async function insertEmployee(
  database: DatabaseManager,
  employee: {
    id: string;
    userId: string;
    name: string;
    role: string;
    departmentId: string | null;
    managerUserId: string | null;
  },
): Promise<void> {
  const now = new Date('2026-08-01T00:00:00.000Z');
  await database
    .query()
    .insertInto('expenseEmployees')
    .values({ ...employee, createdAt: now, updatedAt: now })
    .execute();
}

export async function insertDepartment(
  database: DatabaseManager,
  department: { id: string; code: string; name: string; sort: number },
): Promise<void> {
  const now = new Date('2026-08-01T00:00:00.000Z');
  await database
    .query()
    .insertInto('expenseDepartments')
    .values({ ...department, createdAt: now, updatedAt: now })
    .execute();
}

export async function insertCategory(
  database: DatabaseManager,
  category: { id: string; code: string; name: string; sort: number },
): Promise<void> {
  const now = new Date('2026-08-01T00:00:00.000Z');
  await database
    .query()
    .insertInto('expenseCategories')
    .values({ ...category, createdAt: now, updatedAt: now })
    .execute();
}

export async function seedWorkflowFixtures(
  database: DatabaseManager,
): Promise<void> {
  await insertDepartment(database, {
    id: 'd1',
    code: 'D1',
    name: '研发部',
    sort: 1,
  });
  await insertDepartment(database, {
    id: 'd2',
    code: 'D2',
    name: '市场部',
    sort: 2,
  });
  await insertCategory(database, {
    id: 'c1',
    code: 'TRAVEL',
    name: '差旅费',
    sort: 1,
  });
  await insertCategory(database, {
    id: 'c2',
    code: 'MEAL',
    name: '餐饮费',
    sort: 2,
  });
  await insertEmployee(database, {
    id: 'emp-mgr1',
    userId: 'u-mgr1',
    name: '王强',
    role: 'manager',
    departmentId: 'd1',
    managerUserId: null,
  });
  await insertEmployee(database, {
    id: 'emp-mgr2',
    userId: 'u-mgr2',
    name: '赵敏',
    role: 'manager',
    departmentId: 'd2',
    managerUserId: null,
  });
  await insertEmployee(database, {
    id: 'emp-e1',
    userId: 'u-e1',
    name: '张伟',
    role: 'employee',
    departmentId: 'd1',
    managerUserId: 'u-mgr1',
  });
  await insertEmployee(database, {
    id: 'emp-e2',
    userId: 'u-e2',
    name: '刘洋',
    role: 'employee',
    departmentId: 'd2',
    managerUserId: 'u-mgr2',
  });
  await insertEmployee(database, {
    id: 'emp-fin',
    userId: 'u-fin',
    name: '孙丽',
    role: 'finance',
    departmentId: null,
    managerUserId: null,
  });
}

export async function insertSubmittedReport(
  database: DatabaseManager,
  report: {
    id: string;
    number: string;
    employeeId: string;
    departmentId: string;
    totalAmount: number;
  },
): Promise<void> {
  const now = new Date('2026-08-02T00:00:00.000Z');
  await database
    .query()
    .insertInto('expenseReports')
    .values({
      ...report,
      status: 'submitted',
      purpose: '测试报销',
      submittedAt: now,
      decidedAt: null,
      paidAt: null,
      decidedBy: null,
      decisionComment: null,
      paidBy: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}
