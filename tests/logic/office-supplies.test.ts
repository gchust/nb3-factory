import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';

import {
  OfficeSuppliesError,
  OfficeSuppliesService,
  officeSuppliesServiceToken,
} from '../../server/providers/office-supplies.js';
import { officeSuppliesApiRoutes } from '../../server/routes/office-supplies.js';

const MIGRATIONS_DIRECTORY = path.resolve(
  process.cwd(),
  'database/main/migrations',
);
const SEEDS_DIRECTORY = path.resolve(process.cwd(), 'database/main/seeds');

function createDatabase(): DatabaseManager {
  return createDatabaseManager({
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: ':memory:' },
    },
  });
}

describe('office supplies module', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabase();
    await database.createMigrator({ directory: MIGRATIONS_DIRECTORY }).latest();
  });

  afterEach(async () => {
    await database.destroy();
  });

  describe('migration', () => {
    it('creates the officeSupplies and supplyRequisitions tables', async () => {
      const supplies = await database
        .connection('main')
        .schemaInspector.getPhysicalCollection({
          tableName: 'office_supplies',
        });
      expect(supplies).toBeDefined();
      expect(
        supplies?.columns.map((column) => column.columnName) ?? [],
      ).toEqual(
        expect.arrayContaining([
          'id',
          'code',
          'name',
          'category',
          'quantity',
          'unit',
          'remark',
          'created_at',
        ]),
      );

      const requisitions = await database
        .connection('main')
        .schemaInspector.getPhysicalCollection({
          tableName: 'supply_requisitions',
        });
      expect(requisitions).toBeDefined();
      expect(
        requisitions?.columns.map((column) => column.columnName) ?? [],
      ).toEqual(
        expect.arrayContaining([
          'id',
          'supply_id',
          'requisitioned_at',
          'requisitioner',
          'quantity',
          'remark',
          'created_at',
        ]),
      );
      expect(
        requisitions?.foreignKeys.some(
          (key) =>
            key.referencedCollection.tableName === 'office_supplies' &&
            key.columns.includes('supply_id'),
        ),
      ).toBe(true);
    });

    it('reverses cleanly with down', async () => {
      await database
        .createMigrator({ directory: MIGRATIONS_DIRECTORY })
        .rollback();

      const supplies = await database
        .connection('main')
        .schemaInspector.getPhysicalCollection({
          tableName: 'office_supplies',
        });
      const requisitions = await database
        .connection('main')
        .schemaInspector.getPhysicalCollection({
          tableName: 'supply_requisitions',
        });
      expect(supplies).toBeUndefined();
      expect(requisitions).toBeUndefined();
    });
  });

  describe('seed', () => {
    it('inserts the demo data once and stays idempotent', async () => {
      const seeder = database.createSeeder({ directory: SEEDS_DIRECTORY });
      const first = await seeder.run();
      expect(first.executed).toContain('202609120002_seed_office_supplies');
      expect(first.executed).toContain(
        '202609120003_grant_office_supplies_pages',
      );

      const supplyRows = await database
        .query()
        .selectFrom('officeSupplies')
        .selectAll()
        .execute();
      const requisitionRows = await database
        .query()
        .selectFrom('supplyRequisitions')
        .selectAll()
        .execute();
      expect(supplyRows).toHaveLength(7);
      expect(requisitionRows).toHaveLength(4);

      // A second run changes nothing.
      const second = await seeder.run();
      expect(second.executed).toEqual([]);
      const supplyRowsAfter = await database
        .query()
        .selectFrom('officeSupplies')
        .selectAll()
        .execute();
      expect(supplyRowsAfter).toHaveLength(7);
    });

    it('seeds a zero-stock supply and supplies with history', async () => {
      await database.createSeeder({ directory: SEEDS_DIRECTORY }).run();
      const query = database.query();

      const zeroStock = await query
        .selectFrom('officeSupplies')
        .selectAll()
        .where('code', '=', 'BG-005')
        .executeTakeFirst();
      expect(Number(zeroStock?.quantity)).toBe(0);

      const bg001 = await query
        .selectFrom('officeSupplies')
        .selectAll()
        .where('code', '=', 'BG-001')
        .executeTakeFirst();
      const bg001History = await query
        .selectFrom('supplyRequisitions')
        .selectAll()
        .where('supplyId', '=', Number(bg001?.id))
        .execute();
      expect(bg001History).toHaveLength(2);
    });
  });

  describe('service', () => {
    let service: OfficeSuppliesService;

    beforeEach(async () => {
      await database.createSeeder({ directory: SEEDS_DIRECTORY }).run();
      service = new OfficeSuppliesService(database);
    });

    it('lists seeded supplies sorted by code', async () => {
      const supplies = await service.list();
      expect(supplies).toHaveLength(7);
      expect(supplies[0]?.code).toBe('BG-001');
      const codes = supplies.map((supply) => supply.code);
      expect([...codes].sort()).toEqual(codes);
    });

    it('creates, reads, updates and deletes a supply', async () => {
      const created = await service.create({
        code: 'EL-001',
        name: 'HDMI 线',
        category: '电子配件',
        quantity: 10,
        unit: '根',
        remark: '1.5m',
      });
      expect(created.id).toBeGreaterThan(0);
      expect(created.quantity).toBe(10);

      const detail = await service.find(created.id);
      expect(detail?.supply.code).toBe('EL-001');
      expect(detail?.requisitions).toEqual([]);

      const updated = await service.update(created.id, { quantity: 6 });
      expect(updated.quantity).toBe(6);

      await service.update(created.id, { remark: null });
      const afterClear = await service.find(created.id);
      expect(afterClear?.supply.remark).toBeNull();

      expect(await service.remove(created.id)).toBe(true);
      expect(await service.find(created.id)).toBeUndefined();
    });

    it('rejects a duplicate code on create and update', async () => {
      await expect(
        service.create({
          code: 'BG-001',
          name: '重复编码',
          category: '办公文具',
          quantity: 1,
          unit: '个',
        }),
      ).rejects.toMatchObject({ code: 'CODE_CONFLICT', status: 409 });

      const other = await service.create({
        code: 'EL-002',
        name: '网线',
        category: '电子配件',
        quantity: 5,
        unit: '根',
      });
      await expect(
        service.update(other.id, { code: 'BG-001' }),
      ).rejects.toMatchObject({ code: 'CODE_CONFLICT', status: 409 });
    });

    it('rejects invalid input', async () => {
      await expect(
        service.create({
          code: '',
          name: 'x',
          category: 'y',
          quantity: 2,
          unit: '个',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      await expect(
        service.create({
          code: 'X-1',
          name: 'x',
          category: 'y',
          quantity: -1,
          unit: '个',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      await expect(
        service.requisition(1, {
          requisitionedAt: new Date(),
          requisitioner: '',
          quantity: 1,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('deducts stock on requisition and records the row', async () => {
      const seeded = (await service.list()).find(
        (supply) => supply.code === 'BG-001',
      )!;
      const before = seeded.quantity;
      const requested = 2;

      const result = await service.requisition(seeded.id, {
        requisitionedAt: new Date('2026-09-12T08:00:00.000Z'),
        requisitioner: '测试员',
        quantity: requested,
        remark: '测试领用',
      });

      expect(result.supply.quantity).toBe(before - requested);
      expect(result.requisition.quantity).toBe(requested);
      expect(result.requisition.requisitioner).toBe('测试员');

      const detail = await service.find(seeded.id);
      expect(detail?.supply.quantity).toBe(before - requested);
      expect(detail?.requisitions).toHaveLength(3);
    });

    it('rejects a requisition that exceeds stock and changes nothing', async () => {
      const zero = (await service.list()).find(
        (supply) => supply.code === 'BG-005',
      )!;
      expect(zero.quantity).toBe(0);

      await expect(
        service.requisition(zero.id, {
          requisitionedAt: new Date(),
          requisitioner: '测试员',
          quantity: 1,
        }),
      ).rejects.toEqual(
        expect.objectContaining({
          code: 'INSUFFICIENT_STOCK',
          status: 409,
        }),
      );

      // Nothing was recorded and stock stayed at zero.
      const detail = await service.find(zero.id);
      expect(detail?.supply.quantity).toBe(0);
      expect(detail?.requisitions).toEqual([]);
    });

    it('rejects a partial overdraw: available stock stays untouched', async () => {
      const supply = await service.create({
        code: 'EL-003',
        name: '部分库存',
        category: '办公文具',
        quantity: 3,
        unit: '个',
      });

      await expect(
        service.requisition(supply.id, {
          requisitionedAt: new Date(),
          requisitioner: '测试员',
          quantity: 5,
        }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', status: 409 });

      const after = await service.find(supply.id);
      expect(after?.supply.quantity).toBe(3);
      expect(after?.requisitions).toEqual([]);
    });

    it('keeps requisitions isolated per supply', async () => {
      const first = await service.create({
        code: 'EL-004',
        name: '用品甲',
        category: '办公文具',
        quantity: 5,
        unit: '个',
      });
      const second = await service.create({
        code: 'EL-005',
        name: '用品乙',
        category: '办公文具',
        quantity: 5,
        unit: '个',
      });

      await service.requisition(second.id, {
        requisitionedAt: new Date(),
        requisitioner: '测试员',
        quantity: 2,
      });

      const firstDetail = await service.find(first.id);
      const secondDetail = await service.find(second.id);
      expect(firstDetail?.supply.quantity).toBe(5);
      expect(firstDetail?.requisitions).toEqual([]);
      expect(secondDetail?.supply.quantity).toBe(3);
      expect(secondDetail?.requisitions).toHaveLength(1);
    });

    it('removes requisitions together with their supply', async () => {
      const supply = await service.create({
        code: 'EL-006',
        name: '待删除用品',
        category: '办公文具',
        quantity: 2,
        unit: '个',
      });
      await service.requisition(supply.id, {
        requisitionedAt: new Date(),
        requisitioner: '测试员',
        quantity: 1,
      });

      expect(await service.remove(supply.id)).toBe(true);
      const remaining = await database
        .query()
        .selectFrom('supplyRequisitions')
        .selectAll()
        .where('supplyId', '=', supply.id)
        .execute();
      expect(remaining).toEqual([]);
    });

    it('is a real OfficeSuppliesError instance with a stable code', async () => {
      const zero = (await service.list()).find(
        (supply) => supply.code === 'BG-005',
      )!;
      let thrown: unknown;
      try {
        await service.requisition(zero.id, {
          requisitionedAt: new Date(),
          requisitioner: '测试员',
          quantity: 1,
        });
      } catch (error: unknown) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(OfficeSuppliesError);
      expect(thrown).toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    });
  });

  describe('routes', () => {
    let service: OfficeSuppliesService;
    let authenticated: boolean;

    beforeEach(async () => {
      await database.createSeeder({ directory: SEEDS_DIRECTORY }).run();
      service = new OfficeSuppliesService(database);
      authenticated = false;
    });

    function createRouter() {
      const container = new ServiceContainer();
      container.instance(officeSuppliesServiceToken, service);
      container.instance(authenticationToken, {
        required: () => async (context: unknown, next: unknown) => {
          if (!authenticated) {
            return (
              context as {
                json: (body: unknown, status: number) => Response;
              }
            ).json(
              { code: 'UNAUTHORIZED', message: 'Authentication required' },
              401,
            );
          }
          (context as { set: (key: string, value: unknown) => void }).set(
            'auth',
            { user: { id: '1', name: 'tester' }, session: {} },
          );
          await (next as () => Promise<void>)();
        },
      } as never);

      return officeSuppliesApiRoutes.createRouter({
        container,
      } as unknown as Application);
    }

    async function request(
      router: ReturnType<typeof createRouter>,
      path: string,
      init?: RequestInit,
    ): Promise<Response> {
      return router.request(new Request(`http://localhost${path}`, init));
    }

    it('returns 401 for anonymous access on every path', async () => {
      const router = await createRouter();
      for (const [method, path] of [
        ['GET', '/office-supplies'],
        ['GET', '/office-supplies/1'],
        ['POST', '/office-supplies'],
        ['PUT', '/office-supplies/1'],
        ['DELETE', '/office-supplies/1'],
        ['POST', '/office-supplies/1/requisitions'],
      ] as const) {
        const response = await request(router, path, { method });
        expect(response.status, `${method} ${path}`).toBe(401);
      }
    });

    it('lists supplies for an authenticated user', async () => {
      authenticated = true;
      const router = await createRouter();
      const response = await request(router, '/office-supplies');
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: unknown[] };
      expect(body.data).toHaveLength(7);
    });

    it('creates a supply and rejects a duplicate code with 409', async () => {
      authenticated = true;
      const router = await createRouter();

      const created = await request(router, '/office-supplies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'EL-010',
          name: '荧光笔',
          category: '办公文具',
          quantity: 12,
          unit: '支',
        }),
      });
      expect(created.status).toBe(201);

      const duplicate = await request(router, '/office-supplies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'EL-010',
          name: '重复荧光笔',
          category: '办公文具',
          quantity: 1,
          unit: '支',
        }),
      });
      expect(duplicate.status).toBe(409);
      expect((await duplicate.json()) as { code: string }).toMatchObject({
        code: 'CODE_CONFLICT',
      });
    });

    it('rejects a requisition against a zero-stock supply with 409', async () => {
      authenticated = true;
      const router = await createRouter();

      const zero = (await service.list()).find(
        (supply) => supply.code === 'BG-005',
      );
      expect(zero).toBeDefined();

      const zeroResponse = await request(
        router,
        `/office-supplies/${zero?.id}/requisitions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            requisitionedAt: '2026-09-12T08:00:00.000Z',
            requisitioner: '测试员',
            quantity: 1,
          }),
        },
      );
      expect(zeroResponse.status).toBe(409);
      expect((await zeroResponse.json()) as { code: string }).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
      });
    });

    it('returns 404 for a missing supply on get, update and delete', async () => {
      authenticated = true;
      const router = await createRouter();
      for (const [method, path] of [
        ['GET', '/office-supplies/99999'],
        ['PUT', '/office-supplies/99999'],
        ['DELETE', '/office-supplies/99999'],
      ] as const) {
        const response = await request(router, path, {
          method,
          ...(method === 'PUT'
            ? {
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ quantity: 1 }),
              }
            : {}),
        });
        expect(response.status, `${method} ${path}`).toBe(404);
      }
    });
  });
});
