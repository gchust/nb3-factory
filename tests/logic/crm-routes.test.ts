// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createTestStandaloneApp,
  signIn,
  type SignedInSession,
  type TestStandaloneApp,
} from '../support/standalone-app.js';

let fixture: TestStandaloneApp;
let session: SignedInSession;

beforeAll(async () => {
  fixture = await createTestStandaloneApp();
  session = await signIn(fixture);
}, 120_000);

afterAll(async () => {
  await fixture?.close();
});

function request(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('origin', new URL(fixture.baseUrl).origin);
  if (authenticated) headers.set('cookie', session.cookie);
  return fixture.app.fetch(
    new Request(`${fixture.baseUrl}${path}`, { ...init, headers }),
  );
}

function jsonRequest(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<Response> {
  return request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface CustomerResponse {
  data: {
    id: number;
    name: string;
    industry: string | null;
    opportunityAmountTotal?: number;
    contacts?: unknown[];
    opportunities?: { id: number; amount: number; stage: string }[];
  };
}

describe('CRM API authentication', () => {
  it('rejects anonymous requests', async () => {
    const response = await request('/api/crm/customers', {}, false);
    expect(response.status).toBe(401);
  });
});

describe('CRM API customers', () => {
  it('lists the seeded customers', async () => {
    const response = await request('/api/crm/customers');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { name: string }[] };
    expect(body.data.map((customer) => customer.name).sort()).toEqual([
      '蓝海科技',
      '远山制造',
    ]);
  });

  it('creates and edits a customer, enforcing a required unique name', async () => {
    const missingName = await jsonRequest('/api/crm/customers', 'POST', {
      name: '   ',
    });
    expect(missingName.status).toBe(400);
    await expect(missingName.json()).resolves.toMatchObject({
      code: 'NAME_REQUIRED',
    });

    const created = await jsonRequest('/api/crm/customers', 'POST', {
      name: '新客户',
      industry: '教育',
    });
    expect(created.status).toBe(201);
    const customer = ((await created.json()) as CustomerResponse).data;

    const duplicate = await jsonRequest('/api/crm/customers', 'POST', {
      name: '新客户',
    });
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      code: 'NAME_TAKEN',
    });

    const edited = await jsonRequest(
      `/api/crm/customers/${customer.id}`,
      'PATCH',
      { name: '新客户改名' },
    );
    expect(edited.status).toBe(200);
    await expect(edited.json()).resolves.toMatchObject({
      data: { name: '新客户改名' },
    });

    const missing = await jsonRequest('/api/crm/customers/999999', 'PATCH', {
      name: '不存在',
    });
    expect(missing.status).toBe(404);
  });

  it('returns a customer detail with its contacts and opportunity total', async () => {
    const list = await request('/api/crm/customers');
    const customers = (
      (await list.json()) as { data: { id: number; name: string }[] }
    ).data;
    const target = customers.find((customer) => customer.name === '蓝海科技');
    expect(target).toBeDefined();

    const response = await request(`/api/crm/customers/${target?.id}`);
    expect(response.status).toBe(200);
    const detail = ((await response.json()) as CustomerResponse).data;
    expect(detail.contacts).toHaveLength(2);
    expect(detail.opportunities).toHaveLength(2);
    // 120000 (following) + 80000 (won) — the other customer's deal is excluded.
    expect(detail.opportunityAmountTotal).toBe(200000);
  });
});

describe('CRM API opportunities', () => {
  it('lists opportunities and filters by stage', async () => {
    const all = await request('/api/crm/opportunities');
    expect(all.status).toBe(200);
    await expect(all.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ stage: 'following' }),
        expect.objectContaining({ stage: 'won' }),
        expect.objectContaining({ stage: 'lost' }),
      ]),
    });

    const won = await request('/api/crm/opportunities?stage=won');
    const body = (await won.json()) as { data: { stage: string }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.stage).toBe('won');
  });

  it('rejects a negative amount and an unknown stage', async () => {
    const list = await request('/api/crm/customers');
    const customerId = ((await list.json()) as { data: { id: number }[] })
      .data[0]?.id;

    const negative = await jsonRequest('/api/crm/opportunities', 'POST', {
      name: '金额为负',
      customerId,
      amount: -1,
      stage: 'following',
    });
    expect(negative.status).toBe(400);
    await expect(negative.json()).resolves.toMatchObject({
      code: 'AMOUNT_INVALID',
    });

    const badStage = await jsonRequest('/api/crm/opportunities', 'POST', {
      name: '阶段非法',
      customerId,
      amount: 100,
      stage: 'pending',
    });
    expect(badStage.status).toBe(400);
    await expect(badStage.json()).resolves.toMatchObject({
      code: 'STAGE_INVALID',
    });
  });

  it('updates an amount and moves the customer total', async () => {
    const list = await request('/api/crm/customers');
    const customers = (
      (await list.json()) as { data: { id: number; name: string }[] }
    ).data;
    const target = customers.find((customer) => customer.name === '蓝海科技');
    if (!target) throw new Error('The seeded 蓝海科技 customer is missing.');

    const before = await request(`/api/crm/customers/${target.id}`);
    const beforeTotal =
      ((await before.json()) as CustomerResponse).data.opportunityAmountTotal ??
      0;

    const created = await jsonRequest('/api/crm/opportunities', 'POST', {
      name: '追加机会',
      customerId: target.id,
      amount: 50000,
      stage: 'following',
    });
    expect(created.status).toBe(201);
    const opportunity = (
      (await created.json()) as {
        data: { id: number; amount: number };
      }
    ).data;

    const after = await request(`/api/crm/customers/${target.id}`);
    expect(
      ((await after.json()) as CustomerResponse).data.opportunityAmountTotal,
    ).toBe(beforeTotal + 50000);

    const edited = await jsonRequest(
      `/api/crm/opportunities/${opportunity.id}`,
      'PATCH',
      { amount: 70000, stage: 'won' },
    );
    expect(edited.status).toBe(200);
    await expect(edited.json()).resolves.toMatchObject({
      data: { amount: 70000, stage: 'won' },
    });

    const final = await request(`/api/crm/customers/${target.id}`);
    expect(
      ((await final.json()) as CustomerResponse).data.opportunityAmountTotal,
    ).toBe(beforeTotal + 70000);
  });
});

describe('CRM API contacts', () => {
  it('creates a contact bound to an existing customer', async () => {
    const list = await request('/api/crm/customers');
    const customerId = ((await list.json()) as { data: { id: number }[] })
      .data[0]?.id;

    const invalidCustomer = await jsonRequest('/api/crm/contacts', 'POST', {
      name: '无主联系人',
      customerId: 999999,
    });
    expect(invalidCustomer.status).toBe(400);
    await expect(invalidCustomer.json()).resolves.toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
    });

    const created = await jsonRequest('/api/crm/contacts', 'POST', {
      name: '接口联系人',
      customerId,
      email: 'contact@example.test',
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      data: { name: '接口联系人', customerId },
    });

    const filtered = await request(
      `/api/crm/contacts?customerId=${customerId}`,
    );
    expect(filtered.status).toBe(200);
  });
});
