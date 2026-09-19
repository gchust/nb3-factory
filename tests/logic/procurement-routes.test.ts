// @vitest-environment node
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import {
  createDatabaseManager,
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609190001_create_procurement_tables.js';
import {
  MAX_ATTACHMENT_BYTES,
  PROCUREMENT_ROLE_KEYS,
  ProcurementService,
  procurementServiceToken,
} from '../../server/providers/procurement-service.js';
import { procurementApiRoutes } from '../../server/routes/procurement.js';

const USER_IDS = {
  manager: 'user-manager',
  buyer1: 'user-buyer1',
  buyer2: 'user-buyer2',
  warehouse: 'user-warehouse',
  warehouse2: 'user-warehouse2',
  admin: 'user-admin',
} as const;

const ROLE_KEYS = PROCUREMENT_ROLE_KEYS;

interface Harness {
  database: DatabaseManager;
  container: ServiceContainer;
  service: ProcurementService;
  /** Ids passed to the file repository's deleteOne, in call order. */
  deletedFileIds: string[];
  request(
    path: string,
    options?: {
      user?: keyof typeof USER_IDS;
      method?: string;
      body?: unknown;
      query?: Record<string, string>;
    },
  ): Promise<Response>;
}

async function createHarness(): Promise<Harness> {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const connection = database.connection();
  await migration.up({
    builder: connection.builder,
    query: connection.query,
    connection,
  } as never);
  await connection.builder.createCollection('user', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('name', { length: 255 }).notNull();
    collection.string('username', { length: 255 }).nullable();
    collection.string('email', { length: 320 }).notNull();
    collection.boolean('emailVerified').notNull().defaultTo(false);
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id');
  });

  const now = new Date();
  for (const [key, id] of Object.entries(USER_IDS)) {
    await connection.query
      .insertInto('user')
      .values({
        id,
        name: key,
        username: key,
        email: `${key}@example.invalid`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }
  await connection.query
    .insertInto('suppliers')
    .values([
      {
        id: 1,
        name: 'Supplier One',
        contactName: 'One',
        phone: '1',
        status: 'active',
        ownerId: USER_IDS.buyer1,
        remark: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 2,
        name: 'Supplier Two',
        contactName: 'Two',
        phone: '2',
        status: 'active',
        ownerId: USER_IDS.buyer2,
        remark: null,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .execute();
  await connection.query
    .insertInto('materials')
    .values([
      {
        id: 1,
        code: 'M-1',
        name: 'Material One',
        spec: 'spec',
        unit: 'pc',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 2,
        code: 'M-2',
        name: 'Material Two',
        spec: null,
        unit: 'kg',
        createdAt: now,
        updatedAt: now,
      },
    ])
    .execute();

  const roles = new Map<string, string[]>([
    [USER_IDS.manager, [ROLE_KEYS.manager]],
    [USER_IDS.buyer1, [ROLE_KEYS.buyer]],
    [USER_IDS.buyer2, [ROLE_KEYS.buyer]],
    [USER_IDS.warehouse, [ROLE_KEYS.warehouse]],
    [USER_IDS.warehouse2, [ROLE_KEYS.warehouse]],
    [USER_IDS.admin, ['system-administrator']],
  ]);

  const deletedFileIds: string[] = [];
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  container.instance(authorizationToken, {
    permissionSets: {
      listAssignments: async () =>
        [...roles].flatMap(([userId, keys]) =>
          keys.map((key) => ({
            id: `user:${userId}:${key}`,
            subject: { type: 'user', id: userId },
            permissionSet: key,
          })),
        ),
    },
  } as never);
  container.instance(serverFileRepositoryManagerToken, {
    repository: () => ({
      deleteOne: async (input: { filter: { id: string } }) => {
        deletedFileIds.push(input.filter.id);
      },
    }),
  } as never);
  container.instance(authenticationToken, createTestAuth() as never);
  container.instance(
    procurementServiceToken,
    new ProcurementService(container, '/main'),
  );

  const router = await procurementApiRoutes.createRouter({
    container,
  } as unknown as Application);

  return {
    database,
    container,
    service: container.resolve(procurementServiceToken),
    deletedFileIds,
    request: (path, options = {}) => {
      const headers: Record<string, string> = {};
      if (options.user) headers['x-test-user'] = USER_IDS[options.user];
      if (options.body !== undefined) {
        headers['content-type'] = 'application/json';
      }
      const query = options.query
        ? `?${new URLSearchParams(options.query).toString()}`
        : '';
      return router.request(`${path}${query}`, {
        method: options.method ?? 'GET',
        headers,
        ...(options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
      });
    },
  };
}

function createTestAuth(): {
  required(): MiddlewareHandler;
  optional(): MiddlewareHandler;
} {
  return {
    required: () => async (context, next) => {
      const header = context.req.header('x-test-user');
      if (!header) {
        return context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        );
      }
      context.set('auth', {
        user: { id: header, name: header },
        session: { expiresAt: new Date(Date.now() + 60_000) },
      } as never);
      await next();
    },
    optional: () => async (_context, next) => {
      await next();
    },
  };
}

describe('procurement routes', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.database.destroy();
  });

  async function createOrder(
    user: keyof typeof USER_IDS,
    supplierId = 1,
    items: { materialId: number; quantity: number; unitPrice: number }[] = [
      { materialId: 1, quantity: 10, unitPrice: 2 },
      { materialId: 2, quantity: 5, unitPrice: 4 },
    ],
  ) {
    const response = await harness.request('/procurement/orders', {
      user,
      method: 'POST',
      body: { supplierId, remark: 'test', items },
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { id: number } };
    return body.data;
  }

  async function submit(id: number, user: keyof typeof USER_IDS) {
    const response = await harness.request(`/procurement/orders/${id}/submit`, {
      user,
      method: 'POST',
    });
    expect(response.status).toBe(200);
  }

  async function approve(id: number, user: keyof typeof USER_IDS) {
    const response = await harness.request(
      `/procurement/orders/${id}/approve`,
      { user, method: 'POST' },
    );
    expect(response.status).toBe(200);
  }

  async function insertFile(
    filename: string,
    ext = 'pdf',
    mimeType = 'application/pdf',
    size = 1024,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date();
    await harness.database
      .connection()
      .query.insertInto('procurementFiles')
      .values({
        id,
        disk: 'local',
        key: `objects/${id}.${ext}`,
        filename,
        ext,
        mimeType,
        size,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return id;
  }

  async function attach(
    user: keyof typeof USER_IDS,
    targetType: 'supplier' | 'order' | 'receipt',
    targetId: number,
    category: 'license' | 'quotation' | 'contract' | 'signed_photo',
    fileIds: readonly string[],
  ): Promise<Response> {
    return harness.request('/procurement/attachments', {
      user,
      method: 'POST',
      body: { targetType, targetId, category, fileIds },
    });
  }

  async function listAttachments(
    user: keyof typeof USER_IDS,
    targetType: 'supplier' | 'order' | 'receipt',
    targetId: number,
  ) {
    const response = await harness.request('/procurement/attachments', {
      user,
      query: { targetType, targetId: String(targetId) },
    });
    expect(response.status).toBe(200);
    return (await response.json()) as {
      data: {
        canWrite: boolean;
        items: {
          id: number;
          fileId: string;
          filename: string;
          contentUrl: string;
        }[];
      };
    };
  }

  it('rejects an oversized file and more than five files when linking', async () => {
    const order = await createOrder('buyer1');
    const oversized = await insertFile(
      'huge.pdf',
      'pdf',
      'application/pdf',
      MAX_ATTACHMENT_BYTES + 1,
    );
    const tooLarge = await attach('buyer1', 'order', order.id, 'contract', [
      oversized,
    ]);
    expect(tooLarge.status).toBe(400);
    await expect(tooLarge.json()).resolves.toMatchObject({
      code: 'FILE_TOO_LARGE',
      details: { filename: 'huge.pdf', limit: MAX_ATTACHMENT_BYTES },
    });

    const files = await Promise.all(
      Array.from({ length: 6 }, (_, index) => insertFile(`f${index}.pdf`)),
    );
    const tooMany = await attach(
      'buyer1',
      'order',
      order.id,
      'contract',
      files,
    );
    expect(tooMany.status).toBe(400);
    await expect(tooMany.json()).resolves.toMatchObject({
      code: 'TOO_MANY_FILES',
    });

    // Neither rejected request leaves a link behind.
    const list = await listAttachments('buyer1', 'order', order.id);
    expect(list.data.items).toEqual([]);
  });

  it('rejects anonymous requests', async () => {
    const response = await harness.request('/procurement/suppliers');
    expect(response.status).toBe(401);
  });

  it('scopes orders to the caller and hides other buyers records', async () => {
    const order = await createOrder('buyer1');
    const own = await harness.request('/procurement/orders', {
      user: 'buyer1',
    });
    const ownBody = (await own.json()) as { data: { id: number }[] };
    expect(ownBody.data.map((row) => row.id)).toEqual([order.id]);

    const other = await harness.request('/procurement/orders', {
      user: 'buyer2',
    });
    const otherBody = (await other.json()) as { data: unknown[] };
    expect(otherBody.data).toEqual([]);

    const forbidden = await harness.request(`/procurement/orders/${order.id}`, {
      user: 'buyer2',
    });
    expect(forbidden.status).toBe(403);

    const warehouse = await harness.request('/procurement/orders', {
      user: 'warehouse',
    });
    const warehouseBody = (await warehouse.json()) as { data: unknown[] };
    expect(warehouseBody.data).toEqual([]);
  });

  it('refuses a buyer order for a supplier they do not own', async () => {
    const response = await harness.request('/procurement/orders', {
      user: 'buyer1',
      method: 'POST',
      body: {
        supplierId: 2,
        items: [{ materialId: 1, quantity: 1, unitPrice: 1 }],
      },
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'SUPPLIER_NOT_OWNED',
    });
  });

  it('calculates the order total from its items', async () => {
    const order = await createOrder('buyer1');
    const response = await harness.request(`/procurement/orders/${order.id}`, {
      user: 'buyer1',
    });
    const body = (await response.json()) as {
      data: {
        status: string;
        totalAmount: number;
        items: { materialId: number; amount: number }[];
      };
    };
    expect(body.data.status).toBe('draft');
    expect(body.data.totalAmount).toBe(40);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0].amount).toBe(20);
  });

  it('only a manager can approve, and never their own order', async () => {
    const order = await createOrder('buyer1');
    await submit(order.id, 'buyer1');

    const buyerApprove = await harness.request(
      `/procurement/orders/${order.id}/approve`,
      { user: 'buyer1', method: 'POST' },
    );
    expect(buyerApprove.status).toBe(403);

    await approve(order.id, 'manager');

    const managerOrder = await createOrder('manager');
    await submit(managerOrder.id, 'manager');
    const self = await harness.request(
      `/procurement/orders/${managerOrder.id}/approve`,
      { user: 'manager', method: 'POST' },
    );
    expect(self.status).toBe(403);
    await expect(self.json()).resolves.toMatchObject({
      code: 'ORDER_SELF_APPROVAL',
    });
  });

  it('also refuses an administrator reviewing their own order', async () => {
    const order = await createOrder('admin');
    await submit(order.id, 'admin');
    const self = await harness.request(
      `/procurement/orders/${order.id}/approve`,
      { user: 'admin', method: 'POST' },
    );
    expect(self.status).toBe(403);
    await expect(self.json()).resolves.toMatchObject({
      code: 'ORDER_SELF_APPROVAL',
    });
  });

  it('keeps the reviewer own submitted order out of the approval todo list', async () => {
    const own = await createOrder('manager');
    await submit(own.id, 'manager');
    const other = await createOrder('buyer1');
    await submit(other.id, 'buyer1');

    const response = await harness.request('/procurement/orders/todos', {
      user: 'manager',
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { id: number }[] };
    const ids = body.data.map((row) => row.id);
    expect(ids).toContain(other.id);
    expect(ids).not.toContain(own.id);
  });

  it('keeps reviewed orders read-only and allows a rejected order to be reworked', async () => {
    const order = await createOrder('buyer1');
    await submit(order.id, 'buyer1');

    const rejected = await harness.request(
      `/procurement/orders/${order.id}/reject`,
      { user: 'manager', method: 'POST', body: { reason: 'price too high' } },
    );
    expect(rejected.status).toBe(200);

    const updated = await harness.request(`/procurement/orders/${order.id}`, {
      user: 'buyer1',
      method: 'PATCH',
      body: {
        supplierId: 1,
        items: [{ materialId: 1, quantity: 8, unitPrice: 2 }],
      },
    });
    expect(updated.status).toBe(200);

    await submit(order.id, 'buyer1');
    await approve(order.id, 'manager');

    const afterApproval = await harness.request(
      `/procurement/orders/${order.id}`,
      {
        user: 'buyer1',
        method: 'PATCH',
        body: {
          supplierId: 1,
          items: [{ materialId: 1, quantity: 1, unitPrice: 1 }],
        },
      },
    );
    expect(afterApproval.status).toBe(409);
    await expect(afterApproval.json()).resolves.toMatchObject({
      code: 'ORDER_NOT_EDITABLE',
    });
  });

  it('registers receipts in batches without over-receiving or duplicating', async () => {
    const order = await createOrder('buyer1');
    await submit(order.id, 'buyer1');
    await approve(order.id, 'manager');

    const detail = (await (
      await harness.request(`/procurement/orders/${order.id}`, {
        user: 'warehouse',
      })
    ).json()) as { data: { items: { id: number; quantity: number }[] } };
    const firstItem = detail.data.items[0];

    const first = await harness.request(
      `/procurement/orders/${order.id}/receipts`,
      {
        user: 'warehouse',
        method: 'POST',
        body: {
          requestId: 'req-1',
          receivedAt: '2026-09-10',
          items: [
            { orderItemId: firstItem.id, quantity: firstItem.quantity / 2 },
          ],
        },
      },
    );
    expect(first.status).toBe(200);

    const duplicate = await harness.request(
      `/procurement/orders/${order.id}/receipts`,
      {
        user: 'warehouse',
        method: 'POST',
        body: {
          requestId: 'req-1',
          receivedAt: '2026-09-10',
          items: [
            { orderItemId: firstItem.id, quantity: firstItem.quantity / 2 },
          ],
        },
      },
    );
    const duplicateBody = (await duplicate.json()) as {
      data: { duplicate: boolean };
    };
    expect(duplicateBody.data.duplicate).toBe(true);

    const over = await harness.request(
      `/procurement/orders/${order.id}/receipts`,
      {
        user: 'warehouse',
        method: 'POST',
        body: {
          requestId: 'req-2',
          items: [{ orderItemId: firstItem.id, quantity: firstItem.quantity }],
        },
      },
    );
    expect(over.status).toBe(400);
    await expect(over.json()).resolves.toMatchObject({
      code: 'RECEIPT_QUANTITY_EXCEEDED',
    });

    const secondItem = detail.data.items[1];
    const crossOrder = await harness.request(
      `/procurement/orders/${order.id}/receipts`,
      {
        user: 'warehouse',
        method: 'POST',
        body: {
          requestId: 'req-3',
          items: [{ orderItemId: secondItem.id + 999, quantity: 1 }],
        },
      },
    );
    expect(crossOrder.status).toBe(400);
    await expect(crossOrder.json()).resolves.toMatchObject({
      code: 'RECEIPT_ITEM_NOT_IN_ORDER',
    });

    const rest = await harness.request(
      `/procurement/orders/${order.id}/receipts`,
      {
        user: 'warehouse',
        method: 'POST',
        body: {
          requestId: 'req-4',
          items: [
            { orderItemId: firstItem.id, quantity: firstItem.quantity / 2 },
            { orderItemId: secondItem.id, quantity: secondItem.quantity },
          ],
        },
      },
    );
    expect(rest.status).toBe(200);

    const receipts = (await (
      await harness.request('/procurement/receipts', { user: 'warehouse' })
    ).json()) as { data: unknown[] };
    expect(receipts.data).toHaveLength(2);

    const finalOrder = (await (
      await harness.request(`/procurement/orders/${order.id}`, {
        user: 'manager',
      })
    ).json()) as { data: { receiptStatus: string } };
    expect(finalOrder.data.receiptStatus).toBe('received');
  });

  it('resolves competing submissions of one receipt to a single record', async () => {
    const order = await createOrder('buyer1');
    await submit(order.id, 'buyer1');
    await approve(order.id, 'manager');

    const detail = (await (
      await harness.request(`/procurement/orders/${order.id}`, {
        user: 'warehouse',
      })
    ).json()) as { data: { items: { id: number }[] } };
    const orderItemId = detail.data.items[0].id;
    const body = {
      requestId: 'race-1',
      receivedAt: '2026-09-10',
      items: [{ orderItemId, quantity: 1 }],
    };

    // A double-click can start both requests before either answer arrives,
    // which is exactly the case the unique requestId index must resolve to one
    // saved receipt instead of an unexpected 500.
    const [first, second] = await Promise.all([
      harness.request(`/procurement/orders/${order.id}/receipts`, {
        user: 'warehouse',
        method: 'POST',
        body,
      }),
      harness.request(`/procurement/orders/${order.id}/receipts`, {
        user: 'warehouse',
        method: 'POST',
        body,
      }),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const ids = await Promise.all(
      [first, second].map(async (response) => {
        const payload = (await response.json()) as {
          data: { receipt: { id: number }; duplicate: boolean };
        };
        return payload.data.receipt.id;
      }),
    );
    expect(new Set(ids).size).toBe(1);

    const receipts = (await (
      await harness.request('/procurement/receipts', { user: 'warehouse' })
    ).json()) as { data: unknown[] };
    expect(receipts.data).toHaveLength(1);
  });

  it('allows receipts only on approved orders and only for warehouse staff', async () => {
    const order = await createOrder('buyer1');
    const notApproved = await harness.request(
      `/procurement/orders/${order.id}/receipts`,
      {
        user: 'warehouse',
        method: 'POST',
        body: { items: [{ orderItemId: 1, quantity: 1 }] },
      },
    );
    expect(notApproved.status).toBe(409);

    const buyerDenied = await harness.request(
      `/procurement/orders/${order.id}/receipts`,
      {
        user: 'buyer1',
        method: 'POST',
        body: { items: [{ orderItemId: 1, quantity: 1 }] },
      },
    );
    expect(buyerDenied.status).toBe(403);
  });

  it('applies attachment write rules and keeps reviewed orders read-only', async () => {
    const order = await createOrder('buyer1');
    const fileId = crypto.randomUUID();
    const now = new Date();
    await harness.database
      .connection()
      .query.insertInto('procurementFiles')
      .values({
        id: fileId,
        disk: 'local',
        key: `objects/${fileId}.pdf`,
        filename: 'quote.pdf',
        ext: 'pdf',
        mimeType: 'application/pdf',
        size: 1024,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const attach = await harness.request('/procurement/attachments', {
      user: 'buyer1',
      method: 'POST',
      body: {
        targetType: 'order',
        targetId: order.id,
        category: 'quotation',
        fileIds: [fileId],
      },
    });
    expect(attach.status).toBe(201);

    const list = await harness.request('/procurement/attachments', {
      user: 'buyer1',
      query: { targetType: 'order', targetId: String(order.id) },
    });
    const listBody = (await list.json()) as {
      data: {
        canWrite: boolean;
        items: {
          filename: string;
          uploadedByName: string;
          contentUrl: string;
        }[];
      };
    };
    expect(listBody.data.canWrite).toBe(true);
    expect(listBody.data.items[0].filename).toBe('quote.pdf');
    expect(listBody.data.items[0].uploadedByName).toBe('buyer1');
    expect(listBody.data.items[0].contentUrl).toBe(
      `/main/uploads/procurement-files/${fileId}.pdf`,
    );

    const warehouseDenied = await harness.request('/procurement/attachments', {
      user: 'warehouse',
      method: 'POST',
      body: {
        targetType: 'supplier',
        targetId: 1,
        category: 'license',
        fileIds: [fileId],
      },
    });
    expect(warehouseDenied.status).toBe(403);

    await submit(order.id, 'buyer1');
    const readOnly = await harness.request('/procurement/attachments', {
      user: 'buyer1',
      method: 'POST',
      body: {
        targetType: 'order',
        targetId: order.id,
        category: 'quotation',
        fileIds: [fileId],
      },
    });
    expect(readOnly.status).toBe(403);

    const managerList = await harness.request('/procurement/attachments', {
      user: 'manager',
      query: { targetType: 'order', targetId: String(order.id) },
    });
    expect(managerList.status).toBe(200);
  });

  it('checks file content access against the owning document', async () => {
    const order = await createOrder('buyer1');
    const fileId = crypto.randomUUID();
    const now = new Date();
    await harness.database
      .connection()
      .query.insertInto('procurementFiles')
      .values({
        id: fileId,
        disk: 'local',
        key: `objects/${fileId}.jpg`,
        filename: 'photo.jpg',
        ext: 'jpg',
        mimeType: 'image/jpeg',
        size: 10,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await harness.request('/procurement/attachments', {
      user: 'buyer1',
      method: 'POST',
      body: {
        targetType: 'order',
        targetId: order.id,
        category: 'quotation',
        fileIds: [fileId],
      },
    });

    const buyer = await harness.service.principal(USER_IDS.buyer1, 'buyer1');
    const otherBuyer = await harness.service.principal(
      USER_IDS.buyer2,
      'buyer2',
    );
    const unattached = crypto.randomUUID();

    expect(await harness.service.canReadFile(buyer, fileId)).toBe(true);
    expect(await harness.service.canReadFile(otherBuyer, fileId)).toBe(false);
    // A file that has not been linked to any document yet is staging-only: even
    // a signed-in caller holding the link may not read it.
    expect(await harness.service.canReadFile(otherBuyer, unattached)).toBe(
      false,
    );
    expect(await harness.service.canReadFile(buyer, unattached)).toBe(false);
  });

  it('keeps same-named contracts distinct per order', async () => {
    const orderA = await createOrder('buyer1');
    const orderB = await createOrder('buyer1');
    const fileA = await insertFile('contract.pdf');
    const fileB = await insertFile('contract.pdf');

    expect(
      (await attach('buyer1', 'order', orderA.id, 'contract', [fileA])).status,
    ).toBe(201);
    expect(
      (await attach('buyer1', 'order', orderB.id, 'contract', [fileB])).status,
    ).toBe(201);

    const listA = await listAttachments('buyer1', 'order', orderA.id);
    const listB = await listAttachments('buyer1', 'order', orderB.id);
    expect(listA.data.items).toHaveLength(1);
    expect(listB.data.items).toHaveLength(1);
    expect(listA.data.items[0].fileId).toBe(fileA);
    expect(listB.data.items[0].fileId).toBe(fileB);
    expect(listA.data.items[0].filename).toBe('contract.pdf');
    expect(listB.data.items[0].filename).toBe('contract.pdf');
    // Two uploads with the same name must resolve to two different objects.
    expect(listA.data.items[0].contentUrl).not.toBe(
      listB.data.items[0].contentUrl,
    );

    const removed = await harness.request(
      `/procurement/attachments/${listA.data.items[0].id}`,
      { user: 'buyer1', method: 'DELETE' },
    );
    expect(removed.status).toBe(200);
    expect(harness.deletedFileIds).toEqual([fileA]);

    const buyer = await harness.service.principal(USER_IDS.buyer1, 'buyer1');
    const after = await listAttachments('buyer1', 'order', orderB.id);
    expect(after.data.items.map((item) => item.fileId)).toEqual([fileB]);
    expect(await harness.service.canReadFile(buyer, fileB)).toBe(true);
    expect(await harness.service.canReadFile(buyer, fileA)).toBe(false);
  });

  it('keeps a file linked to two documents alive until the last link is removed', async () => {
    const orderA = await createOrder('buyer1');
    const orderB = await createOrder('buyer1');
    const fileId = await insertFile('shared-spec.pdf');
    const first = await attach('buyer1', 'order', orderA.id, 'quotation', [
      fileId,
    ]);
    const second = await attach('buyer1', 'order', orderB.id, 'contract', [
      fileId,
    ]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const listA = await listAttachments('buyer1', 'order', orderA.id);
    const removed = await harness.request(
      `/procurement/attachments/${listA.data.items[0].id}`,
      { user: 'buyer1', method: 'DELETE' },
    );
    expect(removed.status).toBe(200);
    // The object still backs order B, so it must not be deleted.
    expect(harness.deletedFileIds).toEqual([]);

    const buyer = await harness.service.principal(USER_IDS.buyer1, 'buyer1');
    const listB = await listAttachments('buyer1', 'order', orderB.id);
    expect(listB.data.items.map((item) => item.fileId)).toEqual([fileId]);
    expect(await harness.service.canReadFile(buyer, fileId)).toBe(true);

    const removedLast = await harness.request(
      `/procurement/attachments/${listB.data.items[0].id}`,
      { user: 'buyer1', method: 'DELETE' },
    );
    expect(removedLast.status).toBe(200);
    expect(harness.deletedFileIds).toEqual([fileId]);
    expect(await harness.service.canReadFile(buyer, fileId)).toBe(false);
  });

  it('only the warehouse keeper who registered a receipt may manage its files', async () => {
    const order = await createOrder('buyer1');
    await submit(order.id, 'buyer1');
    await approve(order.id, 'manager');
    const detail = (await (
      await harness.request(`/procurement/orders/${order.id}`, {
        user: 'warehouse',
      })
    ).json()) as { data: { items: { id: number; quantity: number }[] } };
    const itemId = detail.data.items[0].id;

    const firstReceipt = await harness.request(
      `/procurement/orders/${order.id}/receipts`,
      {
        user: 'warehouse',
        method: 'POST',
        body: {
          requestId: 'wh-1',
          items: [{ orderItemId: itemId, quantity: 1 }],
        },
      },
    );
    const firstId = (
      (await firstReceipt.json()) as { data: { receipt: { id: number } } }
    ).data.receipt.id;
    const secondReceipt = await harness.request(
      `/procurement/orders/${order.id}/receipts`,
      {
        user: 'warehouse2',
        method: 'POST',
        body: {
          requestId: 'wh-2',
          items: [{ orderItemId: itemId, quantity: 1 }],
        },
      },
    );
    const secondId = (
      (await secondReceipt.json()) as { data: { receipt: { id: number } } }
    ).data.receipt.id;

    const photo = await insertFile('signed.jpg', 'jpg', 'image/jpeg');
    const own = await attach('warehouse', 'receipt', firstId, 'signed_photo', [
      photo,
    ]);
    expect(own.status).toBe(201);

    // A warehouse keeper cannot add files to another keeper's receipt, and the
    // other keeper cannot add to the first one's either.
    const wrongReceipt = await attach(
      'warehouse',
      'receipt',
      secondId,
      'signed_photo',
      [photo],
    );
    expect(wrongReceipt.status).toBe(403);
    const otherWarehouse = await attach(
      'warehouse2',
      'receipt',
      firstId,
      'signed_photo',
      [photo],
    );
    expect(otherWarehouse.status).toBe(403);

    // Photos stay on the receipt they were registered against.
    const firstList = await listAttachments('warehouse', 'receipt', firstId);
    const secondList = await listAttachments('warehouse2', 'receipt', secondId);
    expect(firstList.data.items.map((item) => item.fileId)).toEqual([photo]);
    expect(secondList.data.items).toEqual([]);
    expect(firstList.data.canWrite).toBe(true);
    expect(secondList.data.canWrite).toBe(true);

    // Any keeper may read a registered receipt, but only its owner may remove.
    const readByOther = await listAttachments('warehouse2', 'receipt', firstId);
    expect(readByOther.data.items.map((item) => item.fileId)).toEqual([photo]);
    expect(readByOther.data.canWrite).toBe(false);
    const removeByOther = await harness.request(
      `/procurement/attachments/${firstList.data.items[0].id}`,
      { user: 'warehouse2', method: 'DELETE' },
    );
    expect(removeByOther.status).toBe(403);
    // A buyer who does not own the order cannot see the receipt at all.
    const buyerDenied = await harness.request('/procurement/attachments', {
      user: 'buyer2',
      query: { targetType: 'receipt', targetId: String(firstId) },
    });
    expect(buyerDenied.status).toBe(403);
  });

  it('follows the order status for attachment writes across submit and reject', async () => {
    const order = await createOrder('buyer1');
    const quote = await insertFile('quote.pdf');
    const contract = await insertFile('contract.pdf');

    expect(
      (await attach('buyer1', 'order', order.id, 'quotation', [quote])).status,
    ).toBe(201);

    await submit(order.id, 'buyer1');
    const blocked = await attach('buyer1', 'order', order.id, 'contract', [
      contract,
    ]);
    expect(blocked.status).toBe(403);
    const existing = await listAttachments('buyer1', 'order', order.id);
    expect(existing.data.canWrite).toBe(false);
    const removeWhileSubmitted = await harness.request(
      `/procurement/attachments/${existing.data.items[0].id}`,
      { user: 'buyer1', method: 'DELETE' },
    );
    expect(removeWhileSubmitted.status).toBe(403);

    const rejected = await harness.request(
      `/procurement/orders/${order.id}/reject`,
      { user: 'manager', method: 'POST', body: { reason: 'need a new quote' } },
    );
    expect(rejected.status).toBe(200);
    expect(
      (await attach('buyer1', 'order', order.id, 'contract', [contract]))
        .status,
    ).toBe(201);

    await submit(order.id, 'buyer1');
    const editableAgain = await listAttachments('buyer1', 'order', order.id);
    expect(editableAgain.data.canWrite).toBe(false);
    expect(editableAgain.data.items).toHaveLength(2);
  });
});
