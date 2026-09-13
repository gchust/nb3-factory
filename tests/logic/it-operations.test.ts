import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import createAssetsMigration from '../../database/main/migrations/202609130002_create_it_assets.js';
import createFilesMigration from '../../database/main/migrations/202609130001_create_it_files.js';
import createWorkOrdersMigration from '../../database/main/migrations/202609130003_create_it_work_orders.js';
import {
  createItService,
  ItError,
  type ItService,
} from '../../server/providers/it-service.js';

/**
 * The IT business rules run against a real SQLite database created by the application's own
 * migrations. A mock would let a rule pass while the unique constraint or column it relies on is
 * missing, which is exactly the failure this suite is meant to catch.
 */
describe('IT operations business rules', () => {
  let directory: string;
  let database: DatabaseManager;
  let service: ItService;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'it-ops-'));
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          database: join(directory, 'test.sqlite'),
          schemaManagement: 'managed',
        },
      },
    } as never);
    await database.connection('main').connect();
    const context = {
      builder: database.builder('main'),
      query: database.query('main'),
      connection: database.connection('main'),
    };
    await createFilesMigration.up(context);
    await createAssetsMigration.up(context);
    await createWorkOrdersMigration.up(context);
    service = createItService(database);
  });

  afterAll(async () => {
    await database.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('rejects a duplicate asset code and accepts a new one', async () => {
    const first = await service.createAsset({
      assetCode: 'AST-0001',
      name: 'Laptop',
      category: 'computer',
      status: 'idle',
    });
    expect(first.assetCode).toBe('AST-0001');

    await expect(
      service.createAsset({
        assetCode: 'AST-0001',
        name: 'Another laptop',
        category: 'computer',
        status: 'idle',
      }),
    ).rejects.toMatchObject({ code: 'ASSET_CODE_EXISTS', status: 409 });
  });

  it('filters assets by category and status', async () => {
    await service.createAsset({
      assetCode: 'AST-0002',
      name: 'Monitor',
      category: 'monitor',
      status: 'idle',
    });
    const monitors = await service.listAssets({ category: 'monitor' });
    expect(monitors.map((asset) => asset.assetCode)).toEqual(['AST-0002']);
    expect(await service.listAssets({ status: 'repairing' })).toEqual([]);
  });

  it('allows only one open checkout per asset', async () => {
    const asset = await service.createAsset({
      assetCode: 'AST-0003',
      name: 'Printer',
      category: 'office',
      status: 'idle',
    });
    const open = await service.createAssignment({
      assetId: asset.id,
      employeeName: 'Alice',
    });
    expect(open.returnedAt).toBeNull();

    await expect(
      service.createAssignment({ assetId: asset.id, employeeName: 'Bob' }),
    ).rejects.toMatchObject({
      code: 'ASSIGNMENT_ALREADY_OPEN',
      status: 409,
    });

    await service.returnAssignment(open.id, '2026-02-01T00:00:00.000Z');
    const second = await service.createAssignment({
      assetId: asset.id,
      employeeName: 'Bob',
    });
    expect(second.employeeName).toBe('Bob');
  });

  it('walks a work order through the status sequence and rejects skips', async () => {
    const order = await service.createWorkOrder({
      reporterName: 'Carol',
      reporterId: 'user-carol',
      description: 'Screen flickers',
      priority: 'high',
    });
    expect(order.status).toBe('pending');

    await expect(
      service.transitionWorkOrder(order.id, 'completed', 'Engineer'),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION', status: 409 });

    const accepted = await service.transitionWorkOrder(
      order.id,
      'in_progress',
      'Engineer',
    );
    expect(accepted.status).toBe('in_progress');
    expect(accepted.assignee).toBe('Engineer');

    await service.addWorkOrderLog(order.id, 'Replaced the cable.', 'Engineer');
    const completed = await service.transitionWorkOrder(
      order.id,
      'completed',
      'Engineer',
    );
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).not.toBeNull();
    expect(completed.logs).toHaveLength(1);
  });

  it('scopes work orders to a single reporter when asked', async () => {
    await service.createWorkOrder({
      reporterName: 'Dave',
      reporterId: 'user-dave',
      description: 'Mouse broken',
      priority: 'low',
    });
    const daves = await service.listWorkOrders({ reporterId: 'user-dave' });
    expect(daves).toHaveLength(1);
    expect(daves[0].reporterId).toBe('user-dave');
  });

  it('reports dashboard counts consistent with stored rows', async () => {
    const [assets, orders, stats] = await Promise.all([
      service.listAssets(),
      service.listWorkOrders(),
      service.dashboard(),
    ]);
    const idle = assets.filter((asset) => asset.status === 'idle').length;
    expect(stats.assetsByStatus.idle).toBe(idle);
    expect(
      (stats.workOrdersByPriority.high ?? 0) +
        (stats.workOrdersByPriority.medium ?? 0) +
        (stats.workOrdersByPriority.low ?? 0),
    ).toBe(orders.length);
  });

  it('does not leak ItError details as a generic failure', async () => {
    await expect(service.getAsset(999_999)).rejects.toBeInstanceOf(ItError);
  });
});
