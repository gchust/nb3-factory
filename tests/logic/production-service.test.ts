import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ProductionError,
  type Actor,
} from '../../server/providers/production-domain.js';
import { ProductionService } from '../../server/providers/production-service.js';
import {
  createTestDatabase,
  hasTable,
  rollbackMigration,
  type TestDatabase,
} from './production-test-db.js';

const SUPERVISOR = 'production-supervisor';
const TEAM_LEADER = 'team-leader';
const INSPECTOR = 'quality-inspector';

function actorOf(
  userId: string,
  roles: readonly string[],
  teamId: number | null,
): Actor {
  return { userId, name: userId, roles: [...roles], teamId, teamName: 'Team' };
}

describe('production service against a real database', () => {
  let database: TestDatabase;
  let service: ProductionService;
  let teamA = 0;
  let teamB = 0;
  let productId = 0;
  let workOrderId = 0;
  let processId = 0;

  beforeAll(async () => {
    database = await createTestDatabase();
    service = new ProductionService(database.manager, {
      listRoleKeys: async (userId) =>
        userId === 'leader-a'
          ? [TEAM_LEADER]
          : userId === 'inspector'
            ? [INSPECTOR]
            : [SUPERVISOR],
    });

    const now = new Date();
    for (const code of ['TEAM-A', 'TEAM-B']) {
      const inserted = await database.connection.query
        .insertInto('teams')
        .values({ code, name: code, createdAt: now, updatedAt: now })
        .execute();
      if (code === 'TEAM-A') teamA = Number(inserted.insertId);
      else teamB = Number(inserted.insertId);
    }

    const product = await service.createProduct({
      code: 'P-1',
      name: '电机外壳',
      specification: '180mm',
      unit: '件',
      standardMinutes: 12.5,
    });
    productId = product.id;

    const order = await service.createWorkOrder(
      {
        code: 'WO-TEST-1',
        productId,
        teamId: teamA,
        plannedQuantity: 100,
        plannedStartDate: '2026-09-01',
        plannedEndDate: '2026-09-10',
        processes: [
          { name: '下料', plannedQuantity: 100 },
          { name: '组装', plannedQuantity: 100 },
        ],
      },
      actorOf('supervisor', [SUPERVISOR], null),
    );
    workOrderId = order.id;
    const detail = await service.getWorkOrderDetail(
      workOrderId,
      actorOf('supervisor', [SUPERVISOR], null),
    );
    processId = Number((detail.processes as { id: number }[])[0].id);
  }, 30_000);

  afterAll(async () => {
    await database.manager.destroy();
  });

  it('creates the schema and drops it on rollback', async () => {
    for (const table of [
      'products',
      'teams',
      'work_orders',
      'work_order_processes',
      'work_reports',
      'defect_records',
      'staff_profiles',
    ]) {
      expect(await hasTable(database.connection, table)).toBe(true);
    }

    const scratch = await createTestDatabase();
    await rollbackMigration(scratch.connection);
    expect(await hasTable(scratch.connection, 'work_orders')).toBe(false);
    expect(await hasTable(scratch.connection, 'products')).toBe(false);
    await scratch.manager.destroy();
  });

  it('computes the reported time from the product standard time', async () => {
    const report = await service.createWorkReport(
      workOrderId,
      {
        processId,
        quantity: 10,
        qualifiedQuantity: 9,
        defectQuantity: 1,
      },
      actorOf('leader-a', [TEAM_LEADER], teamA),
    );
    expect(report.hours).toBe(2.1);

    const detail = await service.getWorkOrderDetail(
      workOrderId,
      actorOf('supervisor', [SUPERVISOR], null),
    );
    expect(detail.reportedQuantity).toBe(10);
    expect(detail.status).toBe('in_production');
    const reportRow = (detail.reports as { reportedAt: string | null }[])[0];
    expect(reportRow.reportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const process = (
      detail.processes as { id: number; completion: number }[]
    )[0];
    expect(process.completion).toBe(10);
  });

  it('rejects a report whose qualified and defective quantities do not add up', async () => {
    await expect(
      service.createWorkReport(
        workOrderId,
        {
          processId,
          quantity: 5,
          qualifiedQuantity: 2,
          defectQuantity: 2,
        },
        actorOf('supervisor', [SUPERVISOR], null),
      ),
    ).rejects.toMatchObject({ code: 'REPORT_QUANTITY_MISMATCH' });
  });

  it('rejects a report that exceeds the remaining process quantity', async () => {
    await expect(
      service.createWorkReport(
        workOrderId,
        {
          processId,
          quantity: 200,
          qualifiedQuantity: 0,
          defectQuantity: 200,
        },
        actorOf('supervisor', [SUPERVISOR], null),
      ),
    ).rejects.toMatchObject({ code: 'REPORT_EXCEEDS_REMAINING' });
  });

  it('does not let an inspector submit a work report', async () => {
    await expect(
      service.createWorkReport(
        workOrderId,
        { processId, quantity: 1, qualifiedQuantity: 1, defectQuantity: 0 },
        actorOf('inspector', [INSPECTOR], null),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('registers a defect and enforces the per-report boundary', async () => {
    const detail = await service.getWorkOrderDetail(
      workOrderId,
      actorOf('supervisor', [SUPERVISOR], null),
    );
    const report = (detail.reports as { id: number }[])[0];

    const defect = await service.createDefectRecord(
      workOrderId,
      {
        workReportId: report.id,
        quantity: 1,
        reason: 'size_deviation',
        disposition: 'rework',
      },
      actorOf('inspector', [INSPECTOR], null),
    );
    expect(defect.quantity).toBe(1);

    await expect(
      service.createDefectRecord(
        workOrderId,
        {
          workReportId: report.id,
          quantity: 1,
          reason: 'size_deviation',
          disposition: 'rework',
        },
        actorOf('inspector', [INSPECTOR], null),
      ),
    ).rejects.toMatchObject({ code: 'DEFECT_EXCEEDS_REPORT' });

    const updated = await service.getWorkOrderDetail(
      workOrderId,
      actorOf('supervisor', [SUPERVISOR], null),
    );
    expect((updated.defects as unknown[]).length).toBe(1);
  });

  it('scopes work orders to a team leader own team', async () => {
    const orderB = await service.createWorkOrder(
      {
        code: 'WO-TEST-2',
        productId,
        teamId: teamB,
        plannedQuantity: 50,
        processes: [{ name: '贴片', plannedQuantity: 50 }],
      },
      actorOf('supervisor', [SUPERVISOR], null),
    );

    const leader = actorOf('leader-a', [TEAM_LEADER], teamA);
    const scoped = await service.listWorkOrders(service.scopeFor(leader));
    expect(scoped.map((order) => order.code)).toEqual(['WO-TEST-1']);

    const supervisor = actorOf('supervisor', [SUPERVISOR], null);
    const all = await service.listWorkOrders(service.scopeFor(supervisor));
    expect(all.map((order) => order.code).sort()).toEqual([
      'WO-TEST-1',
      'WO-TEST-2',
    ]);

    await expect(
      service.getWorkOrderDetail(orderB.id, leader),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('summarises output by product and counts work in production', async () => {
    const statistics = await service.getStatistics({ all: true, teamId: null });
    expect(statistics.inProductionCount).toBe(1);
    const byProduct = statistics.byProduct as {
      qualifiedQuantity: number;
      defectQuantity: number;
      defectRate: number;
    }[];
    expect(byProduct[0]).toMatchObject({
      qualifiedQuantity: 9,
      defectQuantity: 1,
      defectRate: 10,
    });
  });

  it('rejects an unknown role assignment input with a typed error', async () => {
    await expect(
      service.createWorkOrder(
        {
          code: 'WO-TEST-3',
          productId,
          teamId: teamA,
          plannedQuantity: 10,
          processes: [{ name: 'X', plannedQuantity: 10 }],
        },
        actorOf('leader-a', [TEAM_LEADER], teamA),
      ),
    ).rejects.toBeInstanceOf(ProductionError);
  });
});
