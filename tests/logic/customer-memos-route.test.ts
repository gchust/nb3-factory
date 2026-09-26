// @vitest-environment node
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import {
  createCustomerMemoService,
  customerMemoServiceToken,
  type CustomerMemo,
  type CustomerMemoRecord,
  type CustomerMemoRepository,
} from '../../server/providers/customer-memos.js';
import { customerMemoRoutes } from '../../server/routes/customer-memos.js';

const AUTHORIZED = { authorization: 'Bearer test' };
const JSON_HEADERS = { ...AUTHORIZED, 'content-type': 'application/json' };

describe('customer memo routes', () => {
  it('rejects an anonymous request', async () => {
    const container = setupHarness();

    const response = await request(container, '/customer-memos');

    expect(response.status).toBe(401);
  });

  it('lists memos newest first', async () => {
    const container = setupHarness([
      record(1, 'Acme Trading Co.', null, '2026-01-01T00:00:00.000Z'),
      record(
        2,
        'Blue Harbor Cafe',
        'Call before 10 a.m.',
        '2026-01-02T00:00:00.000Z',
      ),
      record(3, 'Riverstone Clinic', null, '2026-01-03T00:00:00.000Z'),
    ]);

    const response = await request(container, '/customer-memos', {
      headers: AUTHORIZED,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: CustomerMemo[] };
    expect(body.data.map((memo) => memo.name)).toEqual([
      'Riverstone Clinic',
      'Blue Harbor Cafe',
      'Acme Trading Co.',
    ]);
  });

  it('creates a memo, trimming its text', async () => {
    const container = setupHarness();

    const response = await request(container, '/customer-memos', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: '  Northwind Traders  ',
        note: '  Ships on Fridays.  ',
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: CustomerMemo };
    expect(body.data).toMatchObject({
      name: 'Northwind Traders',
      note: 'Ships on Fridays.',
    });
    expect(body.data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('stores an empty note as null', async () => {
    const container = setupHarness();

    const response = await request(container, '/customer-memos', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Northwind Traders', note: '   ' }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: CustomerMemo };
    expect(body.data.note).toBeNull();
  });

  it('rejects a blank name with its code', async () => {
    const container = setupHarness();

    const response = await request(container, '/customer-memos', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: '   ' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'CUSTOMER_MEMO_NAME_REQUIRED',
    });
  });

  it('rejects an over-long name with its code', async () => {
    const container = setupHarness();

    const response = await request(container, '/customer-memos', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'x'.repeat(201) }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'CUSTOMER_MEMO_NAME_TOO_LONG',
    });
  });

  it('rejects a body that is not JSON', async () => {
    const container = setupHarness();

    const response = await request(container, '/customer-memos', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: 'not json',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: 'INVALID_JSON' });
  });

  it('reads one memo and reports a missing one', async () => {
    const container = setupHarness([
      record(1, 'Acme Trading Co.', null, '2026-01-01T00:00:00.000Z'),
    ]);

    const found = await request(container, '/customer-memos/1', {
      headers: AUTHORIZED,
    });
    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toMatchObject({
      data: { id: 1, name: 'Acme Trading Co.' },
    });

    const missing = await request(container, '/customer-memos/999', {
      headers: AUTHORIZED,
    });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({
      code: 'CUSTOMER_MEMO_NOT_FOUND',
    });
  });

  it('treats a non-numeric id as a bad request', async () => {
    const container = setupHarness();

    const response = await request(container, '/customer-memos/abc', {
      headers: AUTHORIZED,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'CUSTOMER_MEMO_INVALID_ID',
    });
  });

  it('updates a memo and validates the new name', async () => {
    const container = setupHarness([
      record(1, 'Acme Trading Co.', 'Old note', '2026-01-01T00:00:00.000Z'),
    ]);

    const updated = await request(container, '/customer-memos/1', {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Acme Trading', note: '' }),
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      data: { id: 1, name: 'Acme Trading', note: null },
    });

    const rejected = await request(container, '/customer-memos/1', {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: '' }),
    });
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toEqual({
      code: 'CUSTOMER_MEMO_NAME_REQUIRED',
    });

    const missing = await request(container, '/customer-memos/999', {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'Nobody' }),
    });
    expect(missing.status).toBe(404);
  });

  it('deletes a memo once and reports the second attempt as missing', async () => {
    const container = setupHarness([
      record(1, 'Acme Trading Co.', null, '2026-01-01T00:00:00.000Z'),
    ]);

    const deleted = await request(container, '/customer-memos/1', {
      method: 'DELETE',
      headers: AUTHORIZED,
    });
    expect(deleted.status).toBe(204);

    const gone = await request(container, '/customer-memos/1', {
      headers: AUTHORIZED,
    });
    expect(gone.status).toBe(404);

    const again = await request(container, '/customer-memos/1', {
      method: 'DELETE',
      headers: AUTHORIZED,
    });
    expect(again.status).toBe(404);
    await expect(again.json()).resolves.toEqual({
      code: 'CUSTOMER_MEMO_NOT_FOUND',
    });
  });
});

function record(
  id: number,
  name: string,
  note: string | null,
  createdAt: string,
): CustomerMemoRecord {
  return { id, name, note, createdAt };
}

/** A container with a fake session and the real service over an in-memory repository. */
function setupHarness(
  initial: readonly CustomerMemoRecord[] = [],
): ServiceContainer {
  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required: () => (context: Context, next: () => Promise<void>) => {
      if (context.req.header('authorization') !== 'Bearer test') {
        return context.json({ code: 'UNAUTHORIZED' }, 401);
      }
      context.set('auth', { user: { id: 1 }, session: {} } as never);
      return next();
    },
  } as never);
  const records = new Map(initial.map((memo) => [memo.id, memo]));
  let nextId = Math.max(0, ...records.keys()) + 1;

  const repository = {
    async findMany() {
      return [...records.values()];
    },
    async findOne(options: { filter: { id: number } }) {
      return records.get(options.filter.id) ?? null;
    },
    async createOne(options: { values: Omit<CustomerMemoRecord, 'id'> }) {
      const memo: CustomerMemoRecord = { id: nextId++, ...options.values };
      records.set(memo.id, memo);
      return { record: memo };
    },
    async updateOne(options: {
      filter: { id: number };
      values: Partial<Omit<CustomerMemoRecord, 'id'>>;
    }) {
      const existing = records.get(options.filter.id);
      if (!existing) throw new Error('No such memo.');
      const memo = { ...existing, ...options.values };
      records.set(memo.id, memo);
      return { record: memo };
    },
    async deleteOne(options: { filter: { id: number } }) {
      records.delete(options.filter.id);
    },
  } as unknown as CustomerMemoRepository;

  container.instance(
    customerMemoServiceToken,
    createCustomerMemoService(repository),
  );
  return container;
}

async function request(
  container: ServiceContainer,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const router = await customerMemoRoutes.createRouter({
    container,
  } as unknown as Application);
  return router.request(path, init);
}
