import { describe, expect, it } from 'vitest';

import {
  AssetDomainError,
  DatabaseAssetService,
} from '../server/providers/asset-service.js';
import { createTestDatabase } from './helpers/asset-test-db.js';

const ALL_RECORDS = { $and: [] };

describe('DatabaseAssetService', () => {
  it('lists the seeded assets newest first', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const assets = await service.listAssets({}, ALL_RECORDS);
      expect(assets).toHaveLength(10);
      expect(assets[0].assetNumber).toBe('ASSET-010');
      expect(assets[0].currentEmployeeName).toBeNull();
      expect(assets[1].assetNumber).toBe('ASSET-009');
      expect(assets[1].currentEmployeeName).toBe('陈静');
    } finally {
      await database.destroy();
    }
  });

  it('filters assets by type, status and search', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const computers = await service.listAssets(
        { type: 'computer' },
        ALL_RECORDS,
      );
      expect(computers.map((asset) => asset.assetNumber)).toEqual([
        'ASSET-006',
        'ASSET-004',
        'ASSET-001',
      ]);

      const inUse = await service.listAssets({ status: 'inUse' }, ALL_RECORDS);
      expect(inUse).toHaveLength(4);
      expect(inUse.every((asset) => asset.status === 'inUse')).toBe(true);

      const searched = await service.listAssets(
        { search: 'ThinkPad' },
        ALL_RECORDS,
      );
      expect(searched.map((asset) => asset.assetNumber)).toEqual(['ASSET-001']);
    } finally {
      await database.destroy();
    }
  });

  it('claims an available asset and records the claim', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const employees = await service.listEmployees(ALL_RECORDS);
      const employee = employees.find((row) => row.name === '赵磊');
      expect(employee).toBeDefined();

      const asset = await service.claimAsset(
        1,
        employee!.id,
        '领用测试',
        ALL_RECORDS,
      );
      expect(asset.status).toBe('inUse');
      expect(asset.currentEmployeeId).toBe(employee!.id);
      expect(asset.currentEmployeeName).toBe('赵磊');

      const records = await service.listRecords({ assetId: '1' }, ALL_RECORDS);
      expect(records).toHaveLength(2);
      const open = records.find((record) => record.status === 'claimed');
      expect(open?.employeeName).toBe('赵磊');
      expect(open?.returnedAt).toBeNull();
    } finally {
      await database.destroy();
    }
  });

  it('rejects claiming an asset that is not available', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const employees = await service.listEmployees(ALL_RECORDS);
      const employee = employees.find((row) => row.name === '赵磊');
      await expect(
        service.claimAsset(2, employee!.id, null, ALL_RECORDS),
      ).rejects.toMatchObject({
        name: 'AssetDomainError',
        code: 'ASSET_NOT_CLAIMABLE',
      });
    } finally {
      await database.destroy();
    }
  });

  it('rejects claiming for an unknown employee', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      await expect(
        service.claimAsset(1, 9999, null, ALL_RECORDS),
      ).rejects.toMatchObject({
        name: 'AssetDomainError',
        code: 'EMPLOYEE_NOT_FOUND',
      });
    } finally {
      await database.destroy();
    }
  });

  it('returns an in-use asset and closes its open record', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const asset = await service.returnAsset(2, '归还测试', ALL_RECORDS);
      expect(asset.status).toBe('available');
      expect(asset.currentEmployeeId).toBeNull();

      const records = await service.listRecords({ assetId: '2' }, ALL_RECORDS);
      expect(records).toHaveLength(1);
      expect(records[0].status).toBe('returned');
      expect(records[0].employeeName).toBe('李娜');
      expect(records[0].returnedAt).not.toBeNull();
      expect(records[0].remark).toBe('归还测试');
    } finally {
      await database.destroy();
    }
  });

  it('rejects returning an asset that is not in use', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      await expect(
        service.returnAsset(1, null, ALL_RECORDS),
      ).rejects.toMatchObject({
        name: 'AssetDomainError',
        code: 'ASSET_NOT_RETURNABLE',
      });
    } finally {
      await database.destroy();
    }
  });

  it('creates, updates and deletes an asset', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const created = await service.createAsset({
        assetNumber: 'ASSET-011',
        name: '测试键盘',
        type: 'other',
        brandModel: '某品牌 87 键',
        status: 'available',
        remark: '新建',
      });
      expect(created.id).toBeGreaterThan(0);
      expect(created.status).toBe('available');

      const updated = await service.updateAsset(
        created.id,
        { status: 'maintenance', remark: '送修' },
        ALL_RECORDS,
      );
      expect(updated?.status).toBe('maintenance');
      expect(updated?.remark).toBe('送修');

      const deleted = await service.deleteAsset(created.id, ALL_RECORDS);
      expect(deleted).toBe(true);
      const gone = await service.getAsset(created.id, ALL_RECORDS);
      expect(gone).toBeUndefined();
    } finally {
      await database.destroy();
    }
  });

  it('persists the purchased date on create and update', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const created = await service.createAsset({
        assetNumber: 'ASSET-011',
        name: '测试显示器',
        type: 'monitor',
        brandModel: '某品牌 27 寸',
        status: 'available',
        purchasedAt: '2026-01-15',
      });
      expect(created.purchasedAt).not.toBeNull();
      expect(new Date(created.purchasedAt!).toISOString().slice(0, 10)).toBe(
        '2026-01-15',
      );

      const updated = await service.updateAsset(
        created.id,
        { purchasedAt: '2025-06-30' },
        ALL_RECORDS,
      );
      expect(updated?.purchasedAt).not.toBeNull();
      expect(new Date(updated!.purchasedAt!).toISOString().slice(0, 10)).toBe(
        '2025-06-30',
      );

      const cleared = await service.updateAsset(
        created.id,
        { purchasedAt: null },
        ALL_RECORDS,
      );
      expect(cleared?.purchasedAt).toBeNull();
    } finally {
      await database.destroy();
    }
  });

  it('applies the authorization scope to reads', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const none = await service.listAssets({}, { 'itAssets.id': { $eq: -1 } });
      expect(none).toHaveLength(0);
      const hidden = await service.getAsset(1, {
        'itAssets.id': { $eq: -1 },
      });
      expect(hidden).toBeUndefined();
    } finally {
      await database.destroy();
    }
  });

  it('lists employees with the admin flag', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      const employees = await service.listEmployees(ALL_RECORDS);
      expect(employees).toHaveLength(6);
      const admin = employees.find((row) => row.email === 'admin@nocobase.com');
      expect(admin?.isAdmin).toBe(true);
      const others = employees.filter(
        (row) => row.email !== 'admin@nocobase.com',
      );
      expect(others.every((row) => row.isAdmin === false)).toBe(true);
    } finally {
      await database.destroy();
    }
  });

  it('throws a typed error when a domain rule is violated', async () => {
    const { database } = await createTestDatabase({ seed: true });
    try {
      const service = new DatabaseAssetService(database);
      try {
        await service.claimAsset(2, 1, null, ALL_RECORDS);
        expect.unreachable('claiming an in-use asset should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AssetDomainError);
        expect((error as AssetDomainError).code).toBe('ASSET_NOT_CLAIMABLE');
      }
    } finally {
      await database.destroy();
    }
  });
});
