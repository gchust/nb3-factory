// @vitest-environment node
import type { Auth } from '@nocobase/app-plugin-authentication';
import { Hono, type Context } from 'hono';
import { describe, expect, it } from 'vitest';

import {
  SalesService,
  type ContactRecord,
  type CustomerDetail,
  type CustomerRecord,
  type OpportunityRecord,
} from '../../server/providers/sales-service.js';
import { createSalesRoutes } from '../../server/routes/sales.js';
import { MemorySalesStore } from '../fixtures/sales-store.js';

/** A stand-in for the authentication middleware: it allows or refuses, nothing more. */
function authThat(mode: 'allow' | 'deny'): Auth {
  return {
    required: () => (context: Context, next: () => Promise<void>) => {
      if (mode === 'deny') {
        return context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        );
      }
      return next();
    },
  } as unknown as Auth;
}

function createRouter(mode: 'allow' | 'deny'): Hono {
  return createSalesRoutes({
    auth: authThat(mode),
    service: new SalesService(
      new MemorySalesStore({
        customers: [
          { id: 1, name: 'Acme Manufacturing', industry: 'Manufacturing' },
          { id: 2, name: 'Northwind Retail', industry: 'Retail' },
        ],
        contacts: [
          {
            id: 11,
            name: 'Alice Chen',
            customerId: 1,
            phone: '+1 415 555 0134',
          },
          { id: 12, name: 'Emma Wu', customerId: 2 },
        ],
        opportunities: [
          {
            id: 21,
            name: 'Acme plant upgrade',
            customerId: 1,
            amount: 120000,
            stage: 'following',
          },
          {
            id: 22,
            name: 'Northwind POS rollout',
            customerId: 2,
            amount: 80000,
            stage: 'won',
          },
        ],
      }),
    ),
  });
}

interface ResponseBody {
  readonly status: number;
  readonly body: unknown;
}

async function send(
  router: Hono,
  method: string,
  path: string,
  payload?: unknown,
): Promise<ResponseBody> {
  const init: RequestInit = { method };
  if (payload !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(payload);
  }
  const response = await router.request(path, init);
  return { status: response.status, body: (await response.json()) as unknown };
}

function dataOf<T>(body: unknown): T {
  return (body as { data: T }).data;
}

function errorFields(body: unknown): string[] {
  const errors = (body as { errors?: readonly { path?: readonly unknown[] }[] })
    .errors;
  return (errors ?? []).map((issue) => String(issue.path?.[0]));
}

describe('sales API routes', () => {
  it('refuses an anonymous request for every resource', async () => {
    const router = createRouter('deny');

    for (const [method, path] of [
      ['GET', '/customers'],
      ['POST', '/customers'],
      ['GET', '/customers/1'],
      ['PATCH', '/customers/1'],
      ['GET', '/contacts'],
      ['POST', '/contacts'],
      ['GET', '/contacts/11'],
      ['PATCH', '/contacts/11'],
      ['GET', '/opportunities'],
      ['POST', '/opportunities'],
      ['GET', '/opportunities/21'],
      ['PATCH', '/opportunities/21'],
    ] as const) {
      const response = await send(
        router,
        method,
        path,
        method === 'GET' ? undefined : {},
      );
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });

  it('lists customers', async () => {
    const response = await send(createRouter('allow'), 'GET', '/customers');
    expect(response.status).toBe(200);
    expect(
      dataOf<CustomerRecord[]>(response.body).map((customer) => customer.name),
    ).toEqual(['Acme Manufacturing', 'Northwind Retail']);
  });

  it('returns a customer with its contacts, opportunities and total', async () => {
    const response = await send(createRouter('allow'), 'GET', '/customers/1');
    expect(response.status).toBe(200);
    const detail = dataOf<CustomerDetail>(response.body);
    expect(detail.contacts.map((contact) => contact.name)).toEqual([
      'Alice Chen',
    ]);
    expect(detail.opportunities.map((opportunity) => opportunity.name)).toEqual(
      ['Acme plant upgrade'],
    );
    expect(detail.totalOpportunityAmount).toBe(120000);
  });

  it('creates an opportunity and includes it in the list', async () => {
    const router = createRouter('allow');
    const created = await send(router, 'POST', '/opportunities', {
      name: 'Acme renewal',
      customerId: 1,
      amount: 5000,
      stage: 'following',
    });
    expect(created.status).toBe(201);
    expect(dataOf<OpportunityRecord>(created.body).amount).toBe(5000);

    const list = await send(router, 'GET', '/opportunities?customerId=1');
    expect(
      dataOf<OpportunityRecord[]>(list.body).map(
        (opportunity) => opportunity.name,
      ),
    ).toEqual(['Acme plant upgrade', 'Acme renewal']);
  });

  it('creates a contact', async () => {
    const router = createRouter('allow');
    const created = await send(router, 'POST', '/contacts', {
      name: 'David Park',
      phone: null,
      email: 'david@acme.example',
      customerId: 1,
    });
    expect(created.status).toBe(201);
    expect(dataOf<ContactRecord>(created.body).name).toBe('David Park');
  });

  it('filters opportunities by stage', async () => {
    const response = await send(
      createRouter('allow'),
      'GET',
      '/opportunities?stage=won',
    );
    expect(response.status).toBe(200);
    expect(
      dataOf<OpportunityRecord[]>(response.body).map(
        (opportunity) => opportunity.id,
      ),
    ).toEqual([22]);
  });

  it('updates an amount and the customer total follows it', async () => {
    const router = createRouter('allow');
    const patched = await send(router, 'PATCH', '/opportunities/21', {
      amount: 150000,
    });
    expect(patched.status).toBe(200);

    const detail = await send(router, 'GET', '/customers/1');
    expect(dataOf<CustomerDetail>(detail.body).totalOpportunityAmount).toBe(
      150000,
    );
  });

  it('rejects a negative amount and names the amount field', async () => {
    const response = await send(
      createRouter('allow'),
      'POST',
      '/opportunities',
      {
        name: 'Bad',
        customerId: 1,
        amount: -1,
        stage: 'following',
      },
    );
    expect(response.status).toBe(400);
    expect(errorFields(response.body)).toEqual(['amount']);
  });

  it('rejects a stage outside the three allowed values', async () => {
    const response = await send(
      createRouter('allow'),
      'POST',
      '/opportunities',
      {
        name: 'Bad',
        customerId: 1,
        amount: 10,
        stage: 'negotiating',
      },
    );
    expect(response.status).toBe(400);
    expect(errorFields(response.body)).toEqual(['stage']);
  });

  it('rejects a record without a name', async () => {
    const response = await send(createRouter('allow'), 'POST', '/customers', {
      industry: 'Retail',
    });
    expect(response.status).toBe(400);
    expect(errorFields(response.body)).toEqual(['name']);
  });

  it('rejects a contact whose customer does not exist', async () => {
    const response = await send(createRouter('allow'), 'POST', '/contacts', {
      name: 'Nobody',
      customerId: 999,
    });
    expect(response.status).toBe(400);
    expect(errorFields(response.body)).toEqual(['customerId']);
  });

  it('rejects a customerId query that is not a positive integer', async () => {
    const response = await send(
      createRouter('allow'),
      'GET',
      '/contacts?customerId=abc',
    );
    expect(response.status).toBe(400);
    expect(errorFields(response.body)).toEqual(['customerId']);
  });

  it('answers 404 for a record that does not exist', async () => {
    const router = createRouter('allow');

    expect((await send(router, 'GET', '/customers/999')).status).toBe(404);
    expect((await send(router, 'GET', '/contacts/999')).status).toBe(404);
    expect((await send(router, 'GET', '/opportunities/999')).status).toBe(404);
    expect(
      (await send(router, 'PATCH', '/customers/999', { name: 'X' })).status,
    ).toBe(404);
  });
});
