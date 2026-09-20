import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { ServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import {
  createDriveManager,
  prepareDriveStorage,
  type NocoBaseDriveManager,
} from '@nocobase/drive';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import migration from '../../database/main/migrations/202609190001_create_expense_tables.js';
import fileMigration from '../../database/main/migrations/202609190002_create_expense_files.js';
import revisionMigration from '../../database/main/migrations/202609190003_create_expense_revisions.js';
import seed from '../../database/main/seeds/202609190100_seed_expense_demo_data.js';
import managerChainSeed from '../../database/main/seeds/202609190200_seed_expense_manager_chain.js';

export function createTestDatabase(): DatabaseManager {
  return createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
}

const migrations = [migration, fileMigration, revisionMigration];

export async function migrate(database: DatabaseManager): Promise<void> {
  for (const item of migrations) {
    await item.up({
      builder: database.builder(),
      query: database.query(),
      connection: database.connection(),
    });
  }
}

export async function rollback(database: DatabaseManager): Promise<void> {
  for (const item of [...migrations].reverse()) {
    await item.down?.({
      builder: database.builder(),
      query: database.query(),
      connection: database.connection(),
    });
  }
}

export interface SeedFileInput {
  readonly id: string;
  readonly filename: string;
  readonly ext?: string;
  readonly mimeType?: string;
  readonly size?: number;
  readonly ownerId?: string | null;
}

export interface TestDrive {
  readonly drive: NocoBaseDriveManager;
  readonly location: string;
  dispose(): void;
}

/**
 * A private filesystem disk under a temporary directory, matching the
 * application's `local` disk, so upload and byte-integrity tests exercise the
 * real File Repository instead of a stub.
 */
export async function createTestDrive(): Promise<TestDrive> {
  const location = mkdtempSync(path.join(tmpdir(), 'expense-files-'));
  const config = {
    default: 'local',
    disks: {
      local: {
        driver: 'fs' as const,
        location,
        visibility: 'private' as const,
      },
    },
  };
  await prepareDriveStorage(config);
  const drive = createDriveManager(config);
  return {
    drive,
    location,
    dispose: () => rmSync(location, { recursive: true, force: true }),
  };
}

/**
 * The real Server File Repository for the receipt collection.
 *
 * `ownerId` stands in for the session the upload route resolves: the route's
 * policy stamps the uploader onto every uploaded row, and the tests need the
 * same stamp for the ownership rules to apply.
 */
export function createFileRepository(
  database: DatabaseManager,
  drive: NocoBaseDriveManager,
  ownerId = 'u-e1',
): ReturnType<ServerFileRepositoryManager['repository']> {
  const manager = new ServerFileRepositoryManager(database, drive);
  return manager.repository('expenseFiles', {
    connection: 'main',
    disk: 'local',
    accessPath: '/expense-files',
    policy: {
      read: true,
      create: { scope: true, defaults: { ownerId } },
      update: false,
      delete: true,
    },
  });
}

/** Inserts File Repository metadata without touching a disk, for access-control tests. */
export async function insertFile(
  database: DatabaseManager,
  file: SeedFileInput,
): Promise<void> {
  const now = new Date('2026-08-03T00:00:00.000Z');
  const ext = file.ext ?? 'pdf';
  await database
    .query()
    .insertInto('expenseFiles')
    .values({
      id: file.id,
      disk: 'local',
      key: `objects/${file.id}.${ext}`,
      filename: file.filename,
      ext,
      mimeType: file.mimeType ?? 'application/pdf',
      size: file.size ?? 1024,
      ownerId: file.ownerId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

export async function linkItemFile(
  database: DatabaseManager,
  link: {
    readonly id: string;
    readonly reportId: string;
    readonly itemId: string;
    readonly fileId: string;
  },
): Promise<void> {
  await database
    .query()
    .insertInto('expenseItemFiles')
    .values({ ...link, createdAt: new Date('2026-08-03T00:00:00.000Z') })
    .execute();
}

export async function linkReportFile(
  database: DatabaseManager,
  link: {
    readonly id: string;
    readonly reportId: string;
    readonly fileId: string;
    readonly kind?: string;
  },
): Promise<void> {
  await database
    .query()
    .insertInto('expenseReportFiles')
    .values({
      id: link.id,
      reportId: link.reportId,
      fileId: link.fileId,
      kind: link.kind ?? 'supplement',
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
    })
    .execute();
}

export async function insertItem(
  database: DatabaseManager,
  item: {
    readonly id: string;
    readonly reportId: string;
    readonly categoryId?: string;
    readonly amount?: number;
  },
): Promise<void> {
  await database
    .query()
    .insertInto('expenseItems')
    .values({
      id: item.id,
      reportId: item.reportId,
      categoryId: item.categoryId ?? 'c1',
      expenseDate: new Date('2026-08-02T00:00:00.000Z'),
      amount: item.amount ?? 100,
      description: null,
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
    })
    .execute();
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
  const context = {
    query: database.query(),
    connection: database.connection(),
  };
  await seed.run(context);
  // The manager-chain seed only links accounts the demo seed left without a
  // direct manager; production runs both, so the test helper does too.
  await managerChainSeed.run(context);
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
