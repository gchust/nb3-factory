import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  authenticationToken,
  UserAdministrationError,
  userAdministrationServiceToken,
  type Auth,
  type AuthEnv,
  type UserAdministrationService,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import {
  createDatabaseManager,
  type DatabaseConnection,
  type DatabaseManager,
  type MigrationContext,
} from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import migration1 from '../../database/main/migrations/202609130001_create_procurement_suppliers.js';
import migration2 from '../../database/main/migrations/202609130002_create_procurement_requests.js';
import migration3 from '../../database/main/migrations/202609130003_create_procurement_orders.js';
import migration4 from '../../database/main/migrations/202609130004_create_procurement_files.js';
import {
  createProcurementService,
  procurementServiceToken,
  type ProcurementActor,
  type ProcurementCapabilities,
  type ProcurementService,
} from '../../server/providers/procurement.js';
import { apiRoutes } from '../../server/routes/procurement.js';

const MIGRATIONS = [migration1, migration2, migration3, migration4];

let directory: string;
let manager: DatabaseManager;
let connection: DatabaseConnection;
let service: ProcurementService;

const ADMIN: ProcurementActor = { id: 'admin', name: 'Admin' };
const EMPLOYEE: ProcurementActor = { id: 'employee', name: 'Employee' };
const BUYER: ProcurementActor = { id: 'buyer', name: 'Buyer' };
const MANAGER: ProcurementActor = { id: 'manager', name: 'Manager' };

interface AssignmentRow {
  readonly id: string;
  readonly subject: { readonly type: string; readonly id: string };
  readonly permissionSet: string;
}

function assignments(): readonly AssignmentRow[] {
  return [
    {
      id: 'a1',
      subject: { type: 'user', id: 'admin' },
      permissionSet: 'system-administrator',
    },
    {
      id: 'a2',
      subject: { type: 'user', id: 'manager' },
      permissionSet: 'procurement-manager',
    },
    {
      id: 'a3',
      subject: { type: 'user', id: 'buyer' },
      permissionSet: 'procurement-buyer',
    },
    {
      id: 'a4',
      subject: { type: 'authenticated', id: '*' },
      permissionSet: 'procurement-employee',
    },
  ];
}

function authorizationFake(): {
  permissionSets: { listAssignments(): Promise<readonly AssignmentRow[]> };
} {
  return {
    permissionSets: {
      listAssignments: () => Promise.resolve(assignments()),
    },
  };
}

type AuthorizationDependency = Parameters<typeof createProcurementService>[1];

function authorizationForService(): AuthorizationDependency {
  return authorizationFake() as unknown as AuthorizationDependency;
}

async function capabilities(
  actor: ProcurementActor,
): Promise<ProcurementCapabilities> {
  return service.capabilities(actor);
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'procurement-test-'));
  manager = createDatabaseManager({
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: join(directory, 'test.sqlite') },
    },
  });
  connection = await manager.connect('main');
  for (const migration of MIGRATIONS) {
    const context: MigrationContext = {
      builder: connection.builder,
      query: connection.query,
      connection: {
        name: connection.name,
        driver: connection.driver,
        dialect: connection.dialect,
        capabilities: connection.capabilities,
        client: () => connection.client(),
      },
    };
    await migration.up(context);
  }
  service = createProcurementService(manager, authorizationForService());
});

afterAll(async () => {
  await manager.destroy();
  await rm(directory, { recursive: true, force: true });
});

describe('procurement migrations', () => {
  it('creates the business tables and is reversible', async () => {
    const tables = await connection.query
      .selectFrom('sqlite_master')
      .select('name')
      .where('type', '=', 'table')
      .execute();
    const names = tables.map((row) => String(row.name));
    expect(names).toContain('procurement_suppliers');
    expect(names).toContain('procurement_requests');
    expect(names).toContain('procurement_request_items');
    expect(names).toContain('procurement_orders');
    expect(names).toContain('procurement_receipts');
    expect(names).toContain('procurement_files');
    expect(names).toContain('procurement_attachments');

    // down() reverses in dependency order against a scratch database.
    const scratchDirectory = await mkdtemp(join(tmpdir(), 'procurement-down-'));
    const scratch = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: join(scratchDirectory, 'test.sqlite'),
        },
      },
    });
    const scratchConnection = await scratch.connect('main');
    const contextFor = (target: DatabaseConnection): MigrationContext => ({
      builder: target.builder,
      query: target.query,
      connection: {
        name: target.name,
        driver: target.driver,
        dialect: target.dialect,
        capabilities: target.capabilities,
        client: () => target.client(),
      },
    });
    for (const migration of MIGRATIONS)
      await migration.up(contextFor(scratchConnection));
    for (const migration of [...MIGRATIONS].reverse()) {
      await migration.down?.(contextFor(scratchConnection));
    }
    const remaining = await scratchConnection.query
      .selectFrom('sqlite_master')
      .select('name')
      .where('type', '=', 'table')
      .where('name', 'like', 'procurement%')
      .execute();
    expect(remaining).toHaveLength(0);
    await scratch.destroy();
    await rm(scratchDirectory, { recursive: true, force: true });
  });
});

describe('procurement service', () => {
  it('resolves capabilities from permission-set assignments', async () => {
    const manager = await capabilities(MANAGER);
    expect(manager.canApprove).toBe(true);
    expect(manager.manageSuppliers).toBe(false);

    const buyer = await capabilities(BUYER);
    expect(buyer.manageSuppliers).toBe(true);
    expect(buyer.canApprove).toBe(false);

    const employee = await capabilities(EMPLOYEE);
    expect(employee.viewAllRequests).toBe(false);
  });

  it('computes request totals from items and keeps them per applicant', async () => {
    const employeeCaps = await capabilities(EMPLOYEE);
    const request = await service.createRequest(
      {
        department: 'R&D',
        description: 'Office supplies',
        items: [
          {
            materialName: 'A4',
            specification: '70g',
            quantity: 100,
            unitPrice: 12.5,
          },
          { materialName: 'Toner', quantity: 10, unitPrice: 220 },
        ],
      },
      EMPLOYEE,
    );
    expect(request.totalAmount).toBe(3450);
    expect(request.status).toBe('draft');
    expect(request.items).toHaveLength(2);

    const own = await service.listRequests(EMPLOYEE, employeeCaps);
    expect(own.map((entry) => entry.id)).toContain(request.id);

    const other = await service.listRequests(ADMIN, await capabilities(ADMIN));
    expect(other.map((entry) => entry.id)).toContain(request.id);

    // An employee cannot read another applicant's request.
    await expect(
      service.getRequest(request.id, BUYER, await capabilities(EMPLOYEE)),
    ).rejects.toThrow(/not allowed/i);
  });

  it('moves a request draft -> pending -> approved and requires a rejection reason', async () => {
    const request = await service.createRequest(
      { items: [{ materialName: 'Widget', quantity: 2, unitPrice: 10 }] },
      EMPLOYEE,
    );
    await expect(
      service.submitRequest(request.id, EMPLOYEE, await capabilities(EMPLOYEE)),
    ).resolves.toMatchObject({ status: 'pending' });

    await expect(
      service.approveRequest(request.id, ADMIN),
    ).resolves.toMatchObject({ status: 'approved' });

    const second = await service.createRequest(
      { items: [{ materialName: 'Gadget', quantity: 1, unitPrice: 5 }] },
      EMPLOYEE,
    );
    await service.submitRequest(
      second.id,
      EMPLOYEE,
      await capabilities(EMPLOYEE),
    );
    await expect(
      service.rejectRequest(second.id, ADMIN, '   '),
    ).rejects.toThrow(/reason/i);
    await expect(
      service.rejectRequest(second.id, ADMIN, 'Budget exceeded'),
    ).resolves.toMatchObject({
      status: 'rejected',
      rejectReason: 'Budget exceeded',
    });

    // Approval is a domain invariant, not only a route check.
    await expect(service.approveRequest(second.id, ADMIN)).rejects.toThrow(
      /pending/i,
    );
  });

  it('creates an order from an approved request and guards over-receipts', async () => {
    const supplier = await service.createSupplier(
      {
        name: 'Test Supplier',
        category: 'material',
        status: 'active',
        unifiedSocialCreditCode: 'TESTCODE',
      },
      ADMIN,
      await capabilities(ADMIN),
    );

    const request = await service.createRequest(
      {
        items: [
          { materialName: 'A4', quantity: 100, unitPrice: 12.5 },
          { materialName: 'Toner', quantity: 10, unitPrice: 220 },
        ],
      },
      EMPLOYEE,
    );
    await service.submitRequest(
      request.id,
      EMPLOYEE,
      await capabilities(EMPLOYEE),
    );
    await service.approveRequest(request.id, ADMIN);

    const order = await service.createOrderFromRequest(
      {
        requestId: request.id,
        supplierId: supplier.id,
        orderDate: '2026-09-01',
      },
      ADMIN,
    );
    expect(order.totalQuantity).toBe(110);
    expect(order.amount).toBe(3450);
    expect(order.status).toBe('ordered');

    const partial = await service.createReceipt(
      order.id,
      { quantity: 60, receivedDate: '2026-09-05' },
      BUYER,
    );
    expect(partial.status).toBe('partial');
    expect(partial.receivedQuantity).toBe(60);

    await expect(
      service.createReceipt(
        order.id,
        { quantity: 60, receivedDate: '2026-09-06' },
        BUYER,
      ),
    ).rejects.toThrow(/remaining/i);

    const complete = await service.createReceipt(
      order.id,
      { quantity: 50, receivedDate: '2026-09-07' },
      BUYER,
    );
    expect(complete.status).toBe('received');
    expect(complete.receivedQuantity).toBe(110);
  });

  it('aggregates statistics by supplier and month including pending requests', async () => {
    const pending = await service.createRequest(
      { items: [{ materialName: 'Pending', quantity: 1, unitPrice: 1 }] },
      EMPLOYEE,
    );
    await service.submitRequest(
      pending.id,
      EMPLOYEE,
      await capabilities(EMPLOYEE),
    );

    const stats = await service.statistics();
    expect(stats.pendingApprovalCount).toBeGreaterThanOrEqual(1);
    expect(
      stats.bySupplier.some((row) => row.supplierName === 'Test Supplier'),
    ).toBe(true);
    const September = stats.byMonth.find((row) => row.month === '2026-09');
    expect(September?.total).toBe(3450);
  });
});

describe('procurement routes', () => {
  function buildRouter(): Promise<import('hono').Hono> {
    const container = new ServiceContainer();
    const authentication = {
      required: (): MiddlewareHandler<AuthEnv> => async (context, next) => {
        const user = context.req.header('x-test-user');
        if (!user) {
          return context.json({ code: 'UNAUTHORIZED' }, 401);
        }
        context.set('auth', {
          user: { id: user, name: user, email: `${user}@test` },
          session: { id: 's', token: 't', userId: user, expiresAt: new Date() },
        } as never);
        await next();
        return;
      },
    };
    container.instance(authenticationToken, authentication as unknown as Auth);
    container.instance(
      authorizationToken,
      authorizationFake() as unknown as AppAuthorization,
    );
    container.instance(procurementServiceToken, service);
    const userAdministration = {
      create: async (input: {
        name: string;
        username?: string;
        email: string;
      }) => {
        if (input.email === 'taken@example.com') {
          throw new UserAdministrationError(
            'USER_EMAIL_CONFLICT',
            'A user with this email already exists',
          );
        }
        return {
          id: 'registered-user',
          name: input.name,
          username: input.username,
          email: input.email,
          emailVerified: false,
          disabledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    };
    container.instance(
      userAdministrationServiceToken,
      userAdministration as unknown as UserAdministrationService,
    );
    return apiRoutes.createRouter({ container } as unknown as Application);
  }

  it('rejects anonymous requests with 401', async () => {
    const router = await buildRouter();
    const response = await router.request('/procurement/suppliers');
    expect(response.status).toBe(401);
  });

  it('registers a new user publicly and rejects duplicate or weak input', async () => {
    const router = await buildRouter();
    const register = (body: Record<string, string>) =>
      router.request('/procurement/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    const created = await register({
      name: 'New User',
      username: 'newbie',
      email: 'new@example.com',
      password: 'Password123!',
    });
    expect(created.status).toBe(201);

    const duplicate = await register({
      name: 'New User',
      username: 'newbie2',
      email: 'taken@example.com',
      password: 'Password123!',
    });
    expect(duplicate.status).toBe(409);

    const weak = await register({
      name: 'New User',
      username: 'newbie3',
      email: 'weak@example.com',
      password: 'short',
    });
    expect(weak.status).toBe(400);
  });

  it('denies an employee access to a supplier attachment', async () => {
    const supplier = await service.createSupplier(
      { name: 'Attachment Supplier', category: 'service', status: 'active' },
      ADMIN,
      await capabilities(ADMIN),
    );
    await connection.query
      .insertInto('procurementFiles')
      .values({
        id: '00000000-0000-4000-8000-000000000001',
        disk: 'local',
        key: 'test/key',
        filename: 'license.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    const attachment = await service.addAttachment(
      'supplier',
      String(supplier.id),
      '00000000-0000-4000-8000-000000000001',
    );

    const router = await buildRouter();
    const response = await router.request(
      `/procurement/attachments/${attachment.id}/content`,
      { headers: { 'x-test-user': 'employee' } },
    );
    expect(response.status).toBe(403);
  });

  it('rejects an authenticated employee from supplier maintenance with 403', async () => {
    const router = await buildRouter();
    const response = await router.request('/procurement/suppliers', {
      headers: { 'x-test-user': 'employee' },
    });
    expect(response.status).toBe(403);
  });

  it('serves suppliers to an administrator', async () => {
    const router = await buildRouter();
    const response = await router.request('/procurement/suppliers', {
      headers: { 'x-test-user': 'admin' },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { name: string }[] };
    expect(
      body.data.some((supplier) => supplier.name === 'Test Supplier'),
    ).toBe(true);
  });

  it('lets an employee create and submit a request but not approve it', async () => {
    const router = await buildRouter();
    const created = await router.request('/procurement/requests', {
      method: 'POST',
      headers: {
        'x-test-user': 'employee',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ materialName: 'Route item', quantity: 3, unitPrice: 4 }],
      }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      data: { id: number; totalAmount: number };
    };
    expect(body.data.totalAmount).toBe(12);

    const forbidden = await router.request(
      `/procurement/requests/${body.data.id}/approve`,
      { method: 'POST', headers: { 'x-test-user': 'employee' } },
    );
    expect(forbidden.status).toBe(403);

    const submitted = await router.request(
      `/procurement/requests/${body.data.id}/submit`,
      { method: 'POST', headers: { 'x-test-user': 'employee' } },
    );
    expect(submitted.status).toBe(200);

    const approved = await router.request(
      `/procurement/requests/${body.data.id}/approve`,
      { method: 'POST', headers: { 'x-test-user': 'admin' } },
    );
    expect(approved.status).toBe(200);
  });

  it('rejects an over-receipt with a stable error code', async () => {
    const router = await buildRouter();
    const supplierResponse = await router.request('/procurement/suppliers', {
      method: 'POST',
      headers: { 'x-test-user': 'admin', 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Route Supplier',
        category: 'service',
        status: 'active',
      }),
    });
    const supplier = (await supplierResponse.json()) as {
      data: { id: number };
    };

    const requestResponse = await router.request('/procurement/requests', {
      method: 'POST',
      headers: {
        'x-test-user': 'employee',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ materialName: 'Bulk', quantity: 5, unitPrice: 2 }],
      }),
    });
    const request = (await requestResponse.json()) as { data: { id: number } };
    await router.request(`/procurement/requests/${request.data.id}/submit`, {
      method: 'POST',
      headers: { 'x-test-user': 'employee' },
    });
    await router.request(`/procurement/requests/${request.data.id}/approve`, {
      method: 'POST',
      headers: { 'x-test-user': 'admin' },
    });
    const orderResponse = await router.request('/procurement/orders', {
      method: 'POST',
      headers: { 'x-test-user': 'admin', 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId: request.data.id,
        supplierId: supplier.data.id,
        orderDate: '2026-09-02',
      }),
    });
    const order = (await orderResponse.json()) as { data: { id: number } };

    const over = await router.request(
      `/procurement/orders/${order.data.id}/receipts`,
      {
        method: 'POST',
        headers: { 'x-test-user': 'admin', 'content-type': 'application/json' },
        body: JSON.stringify({ quantity: 6, receivedDate: '2026-09-03' }),
      },
    );
    expect(over.status).toBe(409);
    const body = (await over.json()) as { code: string };
    expect(body.code).toBe('RECEIPT_EXCEEDS_ORDER');

    const ok = await router.request(
      `/procurement/orders/${order.data.id}/receipts`,
      {
        method: 'POST',
        headers: { 'x-test-user': 'admin', 'content-type': 'application/json' },
        body: JSON.stringify({ quantity: 5, receivedDate: '2026-09-03' }),
      },
    );
    expect(ok.status).toBe(201);
    const okBody = (await ok.json()) as { data: { status: string } };
    expect(okBody.data.status).toBe('received');
  });
});
