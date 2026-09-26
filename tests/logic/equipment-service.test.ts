// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseManager } from '@nocobase/db';

import {
  EquipmentError,
  createEquipmentService,
  type EquipmentService,
} from '../../server/providers/equipment';
import { applyMigrations, createTestDatabase } from './equipment-support';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The service is the domain layer: it owns every rule about what may be
 * borrowed, when a return is recorded and how a state is derived. It is tested
 * against a real database with the real migrations, so the checks it makes are
 * exercised against the schema it will actually run on.
 */
describe('equipment service', () => {
  let database: DatabaseManager | undefined;
  let service: EquipmentService;

  beforeEach(async () => {
    database = createTestDatabase();
    await applyMigrations(database);
    service = createEquipmentService({ database });
  });

  afterEach(async () => {
    await database?.destroy();
    database = undefined;
  });

  function connection(): DatabaseManager {
    return database!;
  }

  async function insertEquipment(
    values: Partial<{
      assetCode: string;
      name: string;
      category: string | null;
      notes: string | null;
    }> = {},
  ): Promise<number> {
    const created = await connection()
      .repository<{ id: number }>('equipment')
      .createOne({
        values: {
          assetCode: values.assetCode ?? 'EQ-TEST-001',
          name: values.name ?? '测试设备',
          category: values.category ?? null,
          notes: values.notes ?? null,
          createdAt: new Date().toISOString(),
        },
      });
    return created.record.id;
  }

  async function insertLoan(
    values: Partial<{
      equipmentId: number;
      borrower: string;
      expectedReturnAt: string;
      returnedAt: string | null;
    }> = {},
  ): Promise<number> {
    const created = await connection()
      .repository<{ id: number }>('equipmentLoans')
      .createOne({
        values: {
          equipmentId: values.equipmentId ?? (await insertEquipment()),
          borrower: values.borrower ?? '张三',
          purpose: null,
          borrowedAt: new Date(Date.now() - DAY_MS).toISOString(),
          expectedReturnAt:
            values.expectedReturnAt ??
            new Date(Date.now() + DAY_MS).toISOString(),
          returnedAt: values.returnedAt ?? null,
          createdAt: new Date(Date.now() - DAY_MS).toISOString(),
        },
      });
    return created.record.id;
  }

  async function expectEquipmentError(
    operation: () => Promise<unknown>,
    code: string,
  ): Promise<void> {
    await expect(operation()).rejects.toBeInstanceOf(EquipmentError);
    await expect(operation()).rejects.toMatchObject({ code });
  }

  describe('createEquipment', () => {
    it('creates an available device and trims its text', async () => {
      const created = await service.createEquipment({
        assetCode: '  EQ-NEW-001  ',
        name: '  新设备  ',
        category: '  电脑设备  ',
        notes: '  ',
      });

      expect(created).toMatchObject({
        assetCode: 'EQ-NEW-001',
        name: '新设备',
        category: '电脑设备',
        notes: null,
        status: 'available',
        activeLoan: null,
      });
      expect(created.id).toBeGreaterThan(0);
    });

    it('rejects a missing asset code and a missing name', async () => {
      await expectEquipmentError(
        () => service.createEquipment({ assetCode: '  ', name: '设备' }),
        'VALIDATION_ERROR',
      );
      await expectEquipmentError(
        () => service.createEquipment({ assetCode: 'EQ-1', name: '' }),
        'VALIDATION_ERROR',
      );
    });

    it('rejects an asset code beyond the column length', async () => {
      await expectEquipmentError(
        () =>
          service.createEquipment({
            assetCode: 'x'.repeat(65),
            name: '设备',
          }),
        'VALIDATION_ERROR',
      );
    });

    it('refuses a second device with the same asset code', async () => {
      await service.createEquipment({ assetCode: 'EQ-DUP', name: '第一台' });

      await expectEquipmentError(
        () => service.createEquipment({ assetCode: 'EQ-DUP', name: '第二台' }),
        'ASSET_CODE_TAKEN',
      );
    });
  });

  describe('updateEquipment', () => {
    it('updates a device and keeps its own asset code', async () => {
      const created = await service.createEquipment({
        assetCode: 'EQ-EDIT',
        name: '旧名称',
      });

      const updated = await service.updateEquipment(created.id, {
        assetCode: 'EQ-EDIT',
        name: '新名称',
      });

      expect(updated.name).toBe('新名称');
    });

    it('refuses an asset code already used by another device', async () => {
      await service.createEquipment({ assetCode: 'EQ-A', name: 'A' });
      const second = await service.createEquipment({
        assetCode: 'EQ-B',
        name: 'B',
      });

      await expectEquipmentError(
        () =>
          service.updateEquipment(second.id, {
            assetCode: 'EQ-A',
            name: 'B',
          }),
        'ASSET_CODE_TAKEN',
      );
    });

    it('reports a missing device', async () => {
      await expectEquipmentError(
        () => service.updateEquipment(9999, { assetCode: 'EQ-X', name: 'X' }),
        'EQUIPMENT_NOT_FOUND',
      );
      await expectEquipmentError(
        () => service.getEquipment(9999),
        'EQUIPMENT_NOT_FOUND',
      );
    });
  });

  describe('borrow', () => {
    it('records a borrow and marks the device as borrowed', async () => {
      const equipmentId = await insertEquipment();

      const loan = await service.borrow({
        equipmentId,
        borrower: '李四',
        purpose: '会议演示',
        expectedReturnAt: new Date(Date.now() + DAY_MS),
      });

      expect(loan).toMatchObject({
        equipmentId,
        borrower: '李四',
        purpose: '会议演示',
        status: 'borrowed',
        returnedAt: null,
        equipment: { id: equipmentId },
      });

      const [equipment] = await service.listEquipment();
      expect(equipment).toMatchObject({ status: 'borrowed' });
      expect(equipment!.activeLoan).toMatchObject({ borrower: '李四' });
    });

    it('refuses to borrow a device that is already out', async () => {
      const equipmentId = await insertEquipment();

      await service.borrow({
        equipmentId,
        borrower: '李四',
        expectedReturnAt: new Date(Date.now() + DAY_MS),
      });

      await expectEquipmentError(
        () =>
          service.borrow({
            equipmentId,
            borrower: '王五',
            expectedReturnAt: new Date(Date.now() + DAY_MS),
          }),
        'EQUIPMENT_UNAVAILABLE',
      );
    });

    it('refuses an unknown device', async () => {
      await expectEquipmentError(
        () =>
          service.borrow({
            equipmentId: 9999,
            borrower: '李四',
            expectedReturnAt: new Date(Date.now() + DAY_MS),
          }),
        'EQUIPMENT_NOT_FOUND',
      );
    });

    it('rejects an incomplete or impossible request', async () => {
      const equipmentId = await insertEquipment();

      await expectEquipmentError(
        () =>
          service.borrow({
            equipmentId,
            borrower: '  ',
            expectedReturnAt: new Date(Date.now() + DAY_MS),
          }),
        'VALIDATION_ERROR',
      );
      await expectEquipmentError(
        () =>
          service.borrow({
            equipmentId,
            borrower: '李四',
            expectedReturnAt: new Date(Date.now() - DAY_MS),
          }),
        'VALIDATION_ERROR',
      );
      await expectEquipmentError(
        () =>
          service.borrow({
            equipmentId,
            borrower: '李四',
            expectedReturnAt: 'not-a-date' as unknown as Date,
          }),
        'VALIDATION_ERROR',
      );
      await expectEquipmentError(
        () =>
          service.borrow({
            equipmentId: 0,
            borrower: '李四',
            expectedReturnAt: new Date(Date.now() + DAY_MS),
          }),
        'VALIDATION_ERROR',
      );
    });
  });

  describe('returnLoan', () => {
    it('records the return, frees the device and keeps the original record', async () => {
      const equipmentId = await insertEquipment();
      const borrowed = await service.borrow({
        equipmentId,
        borrower: '李四',
        expectedReturnAt: new Date(Date.now() + DAY_MS),
      });

      const returned = await service.returnLoan(borrowed.id);

      expect(returned.id).toBe(borrowed.id);
      expect(returned.borrowedAt).toBe(borrowed.borrowedAt);
      expect(returned.returnedAt).not.toBeNull();
      expect(returned.status).toBe('returned');

      const [equipment] = await service.listEquipment();
      expect(equipment).toMatchObject({
        status: 'available',
        activeLoan: null,
      });
      await expect(service.listLoans()).resolves.toHaveLength(1);
    });

    it('is idempotent: a repeated return returns the same record', async () => {
      const equipmentId = await insertEquipment();
      const borrowed = await service.borrow({
        equipmentId,
        borrower: '李四',
        expectedReturnAt: new Date(Date.now() + DAY_MS),
      });

      const first = await service.returnLoan(borrowed.id);
      const second = await service.returnLoan(borrowed.id);

      expect(second.id).toBe(first.id);
      expect(second.returnedAt).toBe(first.returnedAt);
      await expect(service.listLoans()).resolves.toHaveLength(1);
    });

    it('reports a missing borrow record', async () => {
      await expectEquipmentError(
        () => service.returnLoan(9999),
        'LOAN_NOT_FOUND',
      );
    });
  });

  describe('derived state', () => {
    it('marks an unreturned loan past its date as overdue', async () => {
      const equipmentId = await insertEquipment();
      await insertLoan({
        equipmentId,
        borrower: '赵六',
        expectedReturnAt: new Date(Date.now() - DAY_MS).toISOString(),
      });

      const [equipment] = await service.listEquipment();
      expect(equipment).toMatchObject({ status: 'overdue' });
      expect(equipment!.activeLoan).toMatchObject({
        borrower: '赵六',
        isOverdue: true,
      });

      const [loan] = await service.listLoans();
      expect(loan).toMatchObject({ status: 'overdue', returnedAt: null });
    });

    it('does not mark a returned loan as overdue', async () => {
      const equipmentId = await insertEquipment();
      await insertLoan({
        equipmentId,
        borrower: '赵六',
        expectedReturnAt: new Date(Date.now() - DAY_MS).toISOString(),
        returnedAt: new Date(Date.now() - DAY_MS / 2).toISOString(),
      });

      const [equipment] = await service.listEquipment();
      expect(equipment).toMatchObject({ status: 'available' });

      const [loan] = await service.listLoans();
      expect(loan).toMatchObject({ status: 'returned' });
    });

    it('lists borrow records newest first with their device', async () => {
      const firstEquipment = await insertEquipment({ assetCode: 'EQ-1' });
      const secondEquipment = await insertEquipment({ assetCode: 'EQ-2' });
      await insertLoan({ equipmentId: firstEquipment, borrower: '甲' });
      await insertLoan({
        equipmentId: secondEquipment,
        borrower: '乙',
        returnedAt: new Date().toISOString(),
      });

      const loans = await service.listLoans();

      expect(loans).toHaveLength(2);
      expect(loans[0]!.equipment?.assetCode).toBe('EQ-2');
      expect(loans[0]!.status).toBe('returned');
      expect(loans[1]!.status).toBe('borrowed');
    });
  });
});
