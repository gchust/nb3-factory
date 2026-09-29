// @vitest-environment node
import type { Auth } from '@nocobase/app-plugin-authentication';
import { afterEach, describe, expect, it } from 'vitest';

import { createCrmService } from '../../server/providers/crm.js';
import { createCrmRoutes } from '../../server/routes/crm.js';
import {
  createSeededDatabase,
  type CrmTestDatabase,
} from '../fixtures/crm-database.js';

const openDatabases: CrmTestDatabase[] = [];

afterEach(async () => {
  while (openDatabases.length > 0) {
    await openDatabases.pop()?.dispose();
  }
});

/**
 * A stand-in for the authentication service. Setting a session is the
 * authentication plugin's job, not this route's, so the double only decides
 * whether the request is signed in; the CRM routes never read the identity.
 */
function testAuth(signedIn: boolean): Auth {
  return {
    required: () => async (context, next) => {
      if (!signedIn) {
        return context.json({ code: 'UNAUTHORIZED' }, 401);
      }
      await next();
    },
  } as unknown as Auth;
}

async function makeRouter(signedIn: boolean) {
  const database = await createSeededDatabase();
  openDatabases.push(database);
  const service = createCrmService(database.manager);
  return createCrmRoutes({ service, auth: testAuth(signedIn) });
}

describe('CRM routes', () => {
  it('rejects an anonymous caller before reaching the service', async () => {
    const routes = await makeRouter(false);
    for (const [method, path] of [
      ['GET', '/crm/customers'],
      ['POST', '/crm/customers'],
      ['GET', '/crm/contacts'],
      ['GET', '/crm/opportunities'],
    ] as const) {
      const response = await routes.request(path, { method });
      expect(response.status).toBe(401);
    }
  });

  it('lists the seeded customers', async () => {
    const routes = await makeRouter(true);
    const response = await routes.request('/crm/customers');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { name: string }[];
    };
    expect(body.data.map((customer) => customer.name)).toEqual([
      'Acme Manufacturing',
      'Northwind Trading',
    ]);
  });

  it('reports the per-customer total from the summary endpoint', async () => {
    const routes = await makeRouter(true);
    const list = (await (await routes.request('/crm/customers')).json()) as {
      data: { id: number; name: string }[];
    };
    const acme = list.data.find(
      (customer) => customer.name === 'Acme Manufacturing',
    )!;
    const response = await routes.request(`/crm/customers/${acme.id}/summary`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { opportunityCount: number; opportunityTotal: number };
    };
    expect(body.data.opportunityCount).toBe(2);
    expect(body.data.opportunityTotal).toBe(205000);
  });

  it('answers 400 with the offending field when validation fails', async () => {
    const routes = await makeRouter(true);
    const response = await routes.request('/crm/opportunities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Negative', customerId: 1, amount: -5 }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      code: string;
      fields: Record<string, string>;
    };
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.fields.amount).toBe('INVALID');
  });

  it('answers 404 for a record that does not exist', async () => {
    const routes = await makeRouter(true);
    const response = await routes.request('/crm/customers/99999');
    expect(response.status).toBe(404);
    expect(((await response.json()) as { code: string }).code).toBe(
      'NOT_FOUND',
    );
  });

  it('rejects an unknown stage filter', async () => {
    const routes = await makeRouter(true);
    const response = await routes.request(
      '/crm/opportunities?stage=almost-won',
    );
    expect(response.status).toBe(400);
  });
});
