// @vitest-environment node
import {
  createAppDatabaseManager,
  resolveDatabaseConfig,
} from '@nocobase/app-server/database';
import { createAppPaths } from '@nocobase/app-server/config';
import type { DatabaseManager } from '@nocobase/db';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  EquipmentError,
  createEquipmentService,
  type EquipmentService,
} from '../../server/providers/equipment-service.js';

/**
 * The borrowing rules against a real SQLite database, migrated from this
 * application's own migration files. The service is what a route delegates to,
 * so what it accepts and refuses here is what the endpoints enforce.
 */

const root = process.cwd();
const migrationsDirectory = path.join(root, 'database/main/migrations');

async function createDatabase(): Promise<DatabaseManager> {
  const paths = createAppPaths({
    rootDir: root,
    storageDir: path.join(root, 'storage'),
  });
  const config = await resolveDatabaseConfig({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: ':memory:',
        schemaManagement: 'managed',
      },
    },
  });
  const database = createAppDatabaseManager(config, paths);
  await database.connect();
  const migrator = database.createMigrator({
    directory: migrationsDirectory,
    packageName: 'app',
    container: { resolve: () => undefined as never },
  });
  await migrator.latest();
  return database;
}

const day = 24 * 60 * 60 * 1000;

let database: DatabaseManager;
let service: EquipmentService;

beforeEach(async () => {
  database = await createDatabase();
  service = createEquipmentService(database);
});

afterEach(async () => {
  await database.destroy();
});

describe('equipment ledger', () => {
  it('adds equipment that starts available', async () => {
    const created = await service.createEquipment({
      assetNo: 'EQ-1001',
      name: 'Dell Latitude',
      category: 'Laptop',
      notes: 'Finance team',
    });

    expect(created).toMatchObject({
      assetNo: 'EQ-1001',
      name: 'Dell Latitude',
      category: 'Laptop',
      notes: 'Finance team',
      status: 'available',
      currentBorrower: null,
      expectedReturnAt: null,
      currentLoanId: null,
      overdue: false,
    });
  });

  it('refuses a missing asset number, a missing name and a duplicate asset number', async () => {
    await expect(
      service.createEquipment({ assetNo: '   ', name: 'Something' }),
    ).rejects.toMatchObject({ code: 'ASSET_NO_REQUIRED', field: 'assetNo' });
    await expect(
      service.createEquipment({ assetNo: 'EQ-1', name: '  ' }),
    ).rejects.toMatchObject({ code: 'NAME_REQUIRED', field: 'name' });

    await service.createEquipment({ assetNo: 'EQ-1', name: 'Laptop' });
    await expect(
      service.createEquipment({ assetNo: 'EQ-1', name: 'Other laptop' }),
    ).rejects.toMatchObject({ code: 'ASSET_NO_TAKEN', field: 'assetNo' });

    const { items } = await service.listEquipment({});
    expect(items).toHaveLength(1);
  });

  it('edits equipment and rejects taking another device’s asset number', async () => {
    const first = await service.createEquipment({
      assetNo: 'EQ-1',
      name: 'Laptop',
    });
    const second = await service.createEquipment({
      assetNo: 'EQ-2',
      name: 'Projector',
    });

    const updated = await service.updateEquipment(second.id, {
      name: 'Epson projector',
      category: 'Display',
    });
    expect(updated).toMatchObject({
      assetNo: 'EQ-2',
      name: 'Epson projector',
      category: 'Display',
    });

    await expect(
      service.updateEquipment(second.id, { assetNo: 'EQ-1' }),
    ).rejects.toMatchObject({ code: 'ASSET_NO_TAKEN', field: 'assetNo' });
    await expect(
      service.updateEquipment(9999, { name: 'Ghost' }),
    ).rejects.toMatchObject({ code: 'EQUIPMENT_NOT_FOUND' });

    // Keeping its own number while editing other fields is not a conflict.
    const again = await service.updateEquipment(first.id, { assetNo: 'EQ-1' });
    expect(again.assetNo).toBe('EQ-1');
  });

  it('searches by asset number or name and filters by availability', async () => {
    const laptop = await service.createEquipment({
      assetNo: 'EQ-1',
      name: 'Dell Latitude',
    });
    await service.createEquipment({ assetNo: 'EQ-2', name: 'Epson projector' });
    await service.borrow(laptop.id, {
      borrower: '李伟',
      expectedReturnAt: new Date(Date.now() + 5 * day).toISOString(),
    });

    const byNumber = await service.listEquipment({ keyword: 'eq-2' });
    expect(byNumber.items.map((item) => item.assetNo)).toEqual(['EQ-2']);

    const byName = await service.listEquipment({ keyword: 'dell' });
    expect(byName.items.map((item) => item.name)).toEqual(['Dell Latitude']);

    const borrowed = await service.listEquipment({ status: 'borrowed' });
    expect(borrowed.items.map((item) => item.assetNo)).toEqual(['EQ-1']);

    const available = await service.listEquipment({ status: 'available' });
    expect(available.items.map((item) => item.assetNo)).toEqual(['EQ-2']);
  });
});

describe('borrowing and returning', () => {
  it('records the borrow, blocks a second borrow and tracks the borrower', async () => {
    const equipment = await service.createEquipment({
      assetNo: 'EQ-1',
      name: 'Laptop',
    });
    const due = new Date(Date.now() + 7 * day);

    const loan = await service.borrow(equipment.id, {
      borrower: '李伟',
      purpose: '客户出差',
      expectedReturnAt: due.toISOString(),
    });

    expect(loan).toMatchObject({
      equipmentId: equipment.id,
      assetNo: 'EQ-1',
      equipmentName: 'Laptop',
      borrower: '李伟',
      purpose: '客户出差',
      returnedAt: null,
      overdue: false,
    });
    expect(Number.isNaN(Date.parse(loan.borrowedAt))).toBe(false);

    const view = await service.getEquipment(equipment.id);
    expect(view).toMatchObject({
      status: 'borrowed',
      currentBorrower: '李伟',
      currentLoanId: loan.id,
    });
    expect(view.expectedReturnAt).toBe(due.toISOString());

    // The device cannot be borrowed again until it has been returned.
    await expect(
      service.borrow(equipment.id, {
        borrower: '王芳',
        expectedReturnAt: due.toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
    expect(await service.listLoans({})).toHaveLength(1);
  });

  it('requires a borrower and an expected return date', async () => {
    const equipment = await service.createEquipment({
      assetNo: 'EQ-1',
      name: 'Laptop',
    });

    await expect(
      service.borrow(equipment.id, {
        borrower: '   ',
        expectedReturnAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'BORROWER_REQUIRED', field: 'borrower' });
    await expect(
      service.borrow(equipment.id, { borrower: 'Bob', expectedReturnAt: '' }),
    ).rejects.toMatchObject({
      code: 'EXPECTED_RETURN_REQUIRED',
      field: 'expectedReturnAt',
    });
    expect(await service.listLoans({})).toHaveLength(0);

    const view = await service.getEquipment(equipment.id);
    expect(view.status).toBe('available');
  });

  it('keeps the original loan on return and makes the device borrowable again', async () => {
    const equipment = await service.createEquipment({
      assetNo: 'EQ-1',
      name: 'Projector',
    });
    const loan = await service.borrow(equipment.id, {
      borrower: '王芳',
      purpose: '培训',
      expectedReturnAt: new Date(Date.now() + 3 * day).toISOString(),
    });

    const returned = await service.returnLoan(loan.id);
    expect(returned.id).toBe(loan.id);
    expect(returned.returnedAt).not.toBeNull();
    expect(returned.borrower).toBe('王芳');
    expect(returned.borrowedAt).toBe(loan.borrowedAt);
    expect(returned.overdue).toBe(false);

    const view = await service.getEquipment(equipment.id);
    expect(view).toMatchObject({
      status: 'available',
      currentBorrower: null,
      currentLoanId: null,
    });

    // Returned means available, so it can be borrowed again.
    const second = await service.borrow(equipment.id, {
      borrower: '张敏',
      expectedReturnAt: new Date(Date.now() + 2 * day).toISOString(),
    });
    expect(second.id).not.toBe(loan.id);
    expect(await service.listLoans({})).toHaveLength(2);
  });

  it('treats a repeated return as a no-op without duplicating the record', async () => {
    const equipment = await service.createEquipment({
      assetNo: 'EQ-1',
      name: 'Camera',
    });
    const loan = await service.borrow(equipment.id, {
      borrower: '李伟',
      expectedReturnAt: new Date(Date.now() + day).toISOString(),
    });

    const first = await service.returnLoan(loan.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await service.returnLoan(loan.id);

    expect(second.returnedAt).toBe(first.returnedAt);
    expect(second.borrowedAt).toBe(first.borrowedAt);
    expect(await service.listLoans({})).toHaveLength(1);
    await expect(service.returnLoan(9999)).rejects.toMatchObject({
      code: 'LOAN_NOT_FOUND',
    });
  });

  it('flags a loan whose expected return has passed as overdue', async () => {
    const equipment = await service.createEquipment({
      assetNo: 'EQ-1',
      name: 'Tablet',
    });
    const loan = await service.borrow(equipment.id, {
      borrower: '王芳',
      expectedReturnAt: new Date(Date.now() - 2 * day).toISOString(),
    });

    const [view] = await service.listLoans({});
    expect(view.id).toBe(loan.id);
    expect(view.overdue).toBe(true);

    const ledger = await service.getEquipment(equipment.id);
    expect(ledger.overdue).toBe(true);

    // A returned loan is never overdue even when it came back late.
    const returned = await service.returnLoan(loan.id);
    expect(returned.overdue).toBe(false);
    const [after] = await service.listLoans({});
    expect(after.overdue).toBe(false);
  });

  it('searches loans by borrower and filters by return state', async () => {
    const first = await service.createEquipment({
      assetNo: 'EQ-1',
      name: 'Laptop',
    });
    const second = await service.createEquipment({
      assetNo: 'EQ-2',
      name: 'Projector',
    });

    const open = await service.borrow(first.id, {
      borrower: '李伟',
      expectedReturnAt: new Date(Date.now() + day).toISOString(),
    });
    await service.borrow(second.id, {
      borrower: '张敏',
      expectedReturnAt: new Date(Date.now() + day).toISOString(),
    });
    await service.returnLoan(open.id);

    const byBorrower = await service.listLoans({ keyword: '张' });
    expect(byBorrower.map((loan) => loan.borrower)).toEqual(['张敏']);

    const active = await service.listLoans({ status: 'active' });
    expect(active.map((loan) => loan.returnedAt)).toEqual([null]);

    const returned = await service.listLoans({ status: 'returned' });
    expect(returned).toHaveLength(1);
    expect(returned[0].id).toBe(open.id);
  });
});

describe('ledger totals', () => {
  it('reports total, borrowed and overdue counts that follow borrow and return', async () => {
    const available = await service.createEquipment({
      assetNo: 'EQ-1',
      name: 'Laptop',
    });
    const active = await service.createEquipment({
      assetNo: 'EQ-2',
      name: 'Projector',
    });
    const overdue = await service.createEquipment({
      assetNo: 'EQ-3',
      name: 'Tablet',
    });
    const historical = await service.createEquipment({
      assetNo: 'EQ-4',
      name: 'Camera',
    });

    expect((await service.listEquipment({})).stats).toEqual({
      total: 4,
      borrowed: 0,
      overdue: 0,
    });

    await service.borrow(active.id, {
      borrower: '李伟',
      expectedReturnAt: new Date(Date.now() + 5 * day).toISOString(),
    });
    const overdueLoan = await service.borrow(overdue.id, {
      borrower: '王芳',
      expectedReturnAt: new Date(Date.now() - 5 * day).toISOString(),
    });
    const historicalLoan = await service.borrow(historical.id, {
      borrower: '张敏',
      expectedReturnAt: new Date(Date.now() + day).toISOString(),
    });
    await service.returnLoan(historicalLoan.id);

    expect((await service.listEquipment({})).stats).toEqual({
      total: 4,
      borrowed: 2,
      overdue: 1,
    });

    // The totals do not change when the list is filtered.
    expect((await service.listEquipment({ keyword: 'Laptop' })).stats).toEqual({
      total: 4,
      borrowed: 2,
      overdue: 1,
    });

    await service.returnLoan(overdueLoan.id);
    expect((await service.listEquipment({})).stats).toEqual({
      total: 4,
      borrowed: 1,
      overdue: 0,
    });
    expect(available.status).toBe('available');
  });
});

describe('office equipment migrations', () => {
  it('applies and rolls back both tables', async () => {
    const collections = database.collections();
    await expect(
      collections.getPhysical('officeEquipment'),
    ).resolves.toBeDefined();
    await expect(
      collections.getPhysical('equipmentLoans'),
    ).resolves.toBeDefined();

    const migrator = database.createMigrator({
      directory: migrationsDirectory,
      packageName: 'app',
      container: { resolve: () => undefined as never },
    });
    const result = await migrator.rollback();
    expect(result.rolledBack).toEqual(
      expect.arrayContaining([
        '202607200001_create_office_equipment',
        '202607200002_create_equipment_loans',
      ]),
    );

    collections.invalidate();
    await expect(
      collections.getPhysical('officeEquipment'),
    ).resolves.toBeUndefined();
    await expect(
      collections.getPhysical('equipmentLoans'),
    ).resolves.toBeUndefined();
  });
});

describe('equipment error type', () => {
  it('carries the code and field the route maps to a response', () => {
    const error = new EquipmentError('NAME_REQUIRED', 'Name is required', {
      field: 'name',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('NAME_REQUIRED');
    expect(error.field).toBe('name');
  });
});
