// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { sqliteDriver } from '@nocobase/db-sqlite';
import { afterAll, describe, expect, it, vi } from 'vitest';

import {
  EquipmentDomainError,
  createEquipmentService,
  equipmentServiceToken,
  type EquipmentService,
} from '../../server/providers/equipment.js';
import apiRoutes from '../../server/routes/equipment.js';

/**
 * These tests exercise the equipment feature against a real SQLite database: the
 * migrations that own the schema, the seeds that install the sample ledger, and
 * the service that enforces the borrow/return rules. Route tests use a stub
 * service so they can pin the authentication boundary and the error mapping
 * without touching a database.
 */

const applicationRoot = process.cwd();
const packageName = '@nocobase/app-template-default';
const tempDirs: string[] = [];
const databases: DatabaseManager[] = [];

const migrationSources = [
  {
    packageName,
    directory: path.join(applicationRoot, 'database/main/migrations'),
  },
];
const seedSources = [
  {
    packageName,
    directory: path.join(applicationRoot, 'database/main/seeds'),
  },
];

afterAll(async () => {
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function migrateDatabase(database: DatabaseManager) {
  return database.createMigrator({ sources: migrationSources, config: {} });
}

function seedDatabase(database: DatabaseManager) {
  return database.createSeeder({ sources: seedSources, config: {} });
}

async function createMigratedDatabase(): Promise<DatabaseManager> {
  const directory = mkdtempSync(path.join(tmpdir(), 'nocobase-equipment-db-'));
  tempDirs.push(directory);
  const database = createDatabaseManager({
    default: 'main',
    drivers: { sqlite: sqliteDriver },
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'database.sqlite'),
        schemaManagement: 'managed',
        debug: false,
      },
    },
  });
  databases.push(database);
  await migrateDatabase(database).latest();
  return database;
}

async function createSeededDatabase(): Promise<DatabaseManager> {
  const database = await createMigratedDatabase();
  await seedDatabase(database).run();
  return database;
}

function createService(database: DatabaseManager): EquipmentService {
  return createEquipmentService(database);
}

describe('equipment schema migrations', () => {
  it('creates both collections and rolls them back', async () => {
    const database = await createMigratedDatabase();
    const collections = database.connection('main').collections;

    expect(await collections.get('equipment')).toBeTruthy();
    expect(await collections.get('equipmentLoans')).toBeTruthy();

    const result = await migrateDatabase(database).rollback();

    // `down` runs in the reverse of the applied order, and each one drops the
    // table its `up` created.
    expect(result.rolledBack).toEqual([
      '202609260002_create_equipment_loans',
      '202609260001_create_equipment',
    ]);
    expect(await collections.get('equipment')).toBeFalsy();
    expect(await collections.get('equipmentLoans')).toBeFalsy();
  });
});

describe('equipment seeds', () => {
  it('installs the five sample devices and three loans', async () => {
    const database = await createSeededDatabase();

    const equipment = await database
      .query()
      .selectFrom('equipment')
      .selectAll()
      .execute();
    const loans = await database
      .query()
      .selectFrom('equipmentLoans')
      .selectAll()
      .execute();

    expect(equipment).toHaveLength(5);
    expect(loans).toHaveLength(3);
    expect(
      equipment.every((row) => typeof row.assetNo === 'string' && row.assetNo),
    ).toBe(true);
  });

  it('is idempotent when run twice', async () => {
    const database = await createMigratedDatabase();
    const first = await seedDatabase(database).run();

    expect(first.executed).toHaveLength(2);

    const second = await seedDatabase(database).run();

    expect(second.executed).toEqual([]);
    const equipment = await database
      .query()
      .selectFrom('equipment')
      .selectAll()
      .execute();
    expect(equipment).toHaveLength(5);
  });
});

describe('equipment service', () => {
  it('derives status, current borrower and statistics from open loans', async () => {
    const service = createService(await createSeededDatabase());
    const all = await service.listEquipment();

    expect(all.stats).toEqual({ total: 5, borrowed: 2, overdue: 1 });

    const available = await service.listEquipment({ status: 'available' });
    expect(available.items).toHaveLength(3);
    expect(available.items.every((item) => item.activeLoan === null)).toBe(
      true,
    );

    const borrowed = await service.listEquipment({ status: 'borrowed' });
    expect(borrowed.items).toHaveLength(2);

    const overdue = borrowed.items.find((item) => item.activeLoan?.overdue);
    expect(overdue?.activeLoan?.borrower).toBe('李娜');
  });

  it('searches the ledger by asset number and by name', async () => {
    const service = createService(await createSeededDatabase());

    const byAssetNo = await service.listEquipment({ search: 'EQ-2026-004' });
    expect(byAssetNo.items).toHaveLength(1);
    expect(byAssetNo.items[0]?.name).toContain('显示器');

    const byName = await service.listEquipment({ search: '投影' });
    expect(byName.items).toHaveLength(1);
    expect(byName.items[0]?.assetNo).toBe('EQ-2026-002');
  });

  it('marks overdue only on open loans and lists them by borrower', async () => {
    const service = createService(await createSeededDatabase());

    const unreturned = await service.listLoans({ status: 'unreturned' });
    expect(unreturned).toHaveLength(2);
    expect(unreturned.filter((loan) => loan.overdue)).toHaveLength(1);
    expect(unreturned.find((loan) => loan.overdue)?.borrower).toBe('李娜');

    const returned = await service.listLoans({ status: 'returned' });
    expect(returned).toHaveLength(1);
    expect(returned[0]?.returnedAt).not.toBeNull();

    const byBorrower = await service.listLoans({ search: '王强' });
    expect(byBorrower).toHaveLength(1);
    expect(byBorrower[0]?.returnedAt).not.toBeNull();
  });

  it('records a loan, refuses a second open loan, and returns idempotently', async () => {
    const database = await createSeededDatabase();
    const service = createService(database);
    const camera = (await service.listEquipment({ search: 'EQ-2026-005' }))
      .items[0];
    expect(camera).toBeTruthy();

    const loan = await service.borrowEquipment({
      equipmentId: camera!.id,
      borrower: '测试用户',
      purpose: '外出拍摄',
      dueAt: '2027-01-15T00:00:00.000Z',
    });

    expect(loan.borrower).toBe('测试用户');
    expect(loan.returnedAt).toBeNull();
    expect(typeof loan.borrowedAt).toBe('string');

    await expect(
      service.borrowEquipment({
        equipmentId: camera!.id,
        borrower: '另一个人',
        dueAt: '2027-02-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'EQUIPMENT_ALREADY_BORROWED' });

    const returned = await service.returnLoan(loan.id);
    expect(returned.returnedAt).not.toBeNull();

    // A repeated return keeps the time that was already confirmed.
    const returnedAgain = await service.returnLoan(loan.id);
    expect(returnedAgain.returnedAt).toBe(returned.returnedAt);

    const afterReturn = await service.listEquipment({ search: 'EQ-2026-005' });
    expect(afterReturn.items[0]?.status).toBe('available');
    expect(afterReturn.stats.borrowed).toBe(2);
  });

  it('rejects incomplete loans and duplicate asset numbers', async () => {
    const service = createService(await createSeededDatabase());

    const missingBorrower = await service
      .borrowEquipment({
        equipmentId: 1,
        borrower: '   ',
        dueAt: '2027-01-15T00:00:00.000Z',
      })
      .catch((error: unknown) => error);
    expect(missingBorrower).toBeInstanceOf(EquipmentDomainError);
    expect(missingBorrower).toMatchObject({
      code: 'VALIDATION_ERROR',
      field: 'borrower',
    });

    const missingDueAt = await service
      .borrowEquipment({ equipmentId: 1, borrower: '张三' })
      .catch((error: unknown) => error);
    expect(missingDueAt).toMatchObject({
      code: 'VALIDATION_ERROR',
      field: 'dueAt',
    });

    const taken = await service
      .createEquipment({
        assetNo: 'EQ-2026-001',
        name: '重复设备',
        category: '其他',
      })
      .catch((error: unknown) => error);
    expect(taken).toMatchObject({
      code: 'ASSET_NO_TAKEN',
      field: 'assetNo',
    });

    const missingName = await service
      .createEquipment({ assetNo: 'EQ-2026-900', category: '其他' })
      .catch((error: unknown) => error);
    expect(missingName).toMatchObject({
      code: 'VALIDATION_ERROR',
      field: 'name',
    });

    const missingLoan = await service
      .returnLoan(999_999)
      .catch((error: unknown) => error);
    expect(missingLoan).toMatchObject({ code: 'LOAN_NOT_FOUND' });
  });

  it('creates and updates a device', async () => {
    const service = createService(await createSeededDatabase());

    const created = await service.createEquipment({
      assetNo: 'EQ-2026-010',
      name: '平板电脑',
      category: '移动设备',
      notes: '测试新增',
    });
    expect(created.assetNo).toBe('EQ-2026-010');

    const updated = await service.updateEquipment(created.id, {
      name: '平板电脑（新）',
    });
    expect(updated.name).toBe('平板电脑（新）');
    expect(updated.assetNo).toBe('EQ-2026-010');

    const duplicate = await service
      .updateEquipment(created.id, { assetNo: 'EQ-2026-001' })
      .catch((error: unknown) => error);
    expect(duplicate).toMatchObject({ code: 'ASSET_NO_TAKEN' });
  });
});

interface RouterOptions {
  authenticated: boolean;
  service?: Partial<EquipmentService>;
}

function createRouteTestApp(options: RouterOptions): unknown {
  const service = options.service ?? {};
  const auth = {
    required:
      () =>
      async (
        context: { json: (body: unknown, status: number) => Response },
        next: () => Promise<void>,
      ): Promise<Response | void> => {
        if (!options.authenticated) {
          return context.json({ error: 'Unauthorized' }, 401);
        }
        await next();
      },
  };

  return {
    container: {
      resolve: (token: unknown): unknown => {
        if (token === authenticationToken) {
          return auth;
        }
        if (token === equipmentServiceToken) {
          return service;
        }
        throw new Error('Unexpected service token in route test.');
      },
    },
  };
}

function createRouter(options: RouterOptions) {
  return apiRoutes.createRouter(createRouteTestApp(options) as never);
}

describe('equipment routes', () => {
  it('requires authentication on the ledger and the borrow records', async () => {
    const listEquipment = vi.fn();
    const listLoans = vi.fn();
    const router = createRouter({
      authenticated: false,
      service: { listEquipment, listLoans },
    });

    const ledger = await router.request('/equipment');
    const loans = await router.request('/loans');

    expect(ledger.status).toBe(401);
    expect(loans.status).toBe(401);
    expect(listEquipment).not.toHaveBeenCalled();
    expect(listLoans).not.toHaveBeenCalled();
  });

  it('lists the ledger with statistics for an authenticated caller', async () => {
    const router = createRouter({
      authenticated: true,
      service: {
        listEquipment: vi.fn().mockResolvedValue({
          items: [{ id: 1, assetNo: 'EQ-2026-001' }],
          stats: { total: 1, borrowed: 0, overdue: 0 },
        }),
      },
    });

    const response = await router.request('/equipment?status=available');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{ id: 1, assetNo: 'EQ-2026-001' }],
      stats: { total: 1, borrowed: 0, overdue: 0 },
    });
  });

  it('maps a domain conflict to 409 and a validation failure to 422', async () => {
    const conflict = createRouter({
      authenticated: true,
      service: {
        borrowEquipment: vi
          .fn()
          .mockRejectedValue(
            new EquipmentDomainError(
              'EQUIPMENT_ALREADY_BORROWED',
              'Already lent out.',
            ),
          ),
      },
    });

    const conflictResponse = await conflict.request('/equipment/2/loans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ borrower: '张三', dueAt: '2027-01-01' }),
    });
    expect(conflictResponse.status).toBe(409);
    await expect(conflictResponse.json()).resolves.toMatchObject({
      code: 'EQUIPMENT_ALREADY_BORROWED',
    });

    const invalid = createRouter({
      authenticated: true,
      service: {
        borrowEquipment: vi
          .fn()
          .mockRejectedValue(
            new EquipmentDomainError(
              'VALIDATION_ERROR',
              'Field "dueAt" is required.',
              'dueAt',
            ),
          ),
      },
    });

    const invalidResponse = await invalid.request('/equipment/2/loans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ borrower: '张三' }),
    });
    expect(invalidResponse.status).toBe(422);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      code: 'VALIDATION_ERROR',
      field: 'dueAt',
    });
  });
});
