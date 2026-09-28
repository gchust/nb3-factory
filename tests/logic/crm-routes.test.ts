// @vitest-environment node
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import type { Auth } from '@nocobase/app-plugin-authentication/server';

import { createCrmApiRoutes } from '../../server/routes/crm.js';
import {
  CrmError,
  type ContactRecord,
  type CrmService,
  type CustomerInput,
  type CustomerRecord,
  type OpportunityRecord,
} from '../../server/providers/crm.js';

const customer: CustomerRecord = {
  id: 1,
  name: '星辰科技',
  industry: '软件服务',
  createdAt: '2026-09-28T00:00:00.000Z',
  updatedAt: '2026-09-28T00:00:00.000Z',
};

/**
 * A session gate that answers the way the real `auth.required()` does: no
 * session, no request. It makes the point this suite exists for — a route under
 * `/api` authenticates nothing by itself — observable without a signed-in
 * browser.
 */
const auth = {
  required:
    () =>
    async (
      context: {
        req: { header: (name: string) => string | undefined };
        json: (body: unknown, status: number) => Response;
      },
      next: () => Promise<void>,
    ) => {
      if (context.req.header('x-test-session') !== 'yes') {
        return context.json({ code: 'UNAUTHORIZED' }, 401);
      }
      await next();
    },
} as unknown as Auth;

function buildService(overrides: Partial<CrmService> = {}): CrmService {
  const base: CrmService = {
    listCustomers: async () => [customer],
    getCustomer: async (id) => {
      if (id !== customer.id) {
        throw new CrmError('NOT_FOUND', 'Customer not found.');
      }
      return {
        ...customer,
        contacts: [],
        opportunities: [],
        totalAmount: 0,
      };
    },
    createCustomer: async (input: CustomerInput) => {
      if (typeof input.name !== 'string' || input.name.trim() === '') {
        throw new CrmError('VALIDATION_ERROR', 'Name is required.', {
          name: 'required',
        });
      }
      return { ...customer, id: 7, name: input.name.trim() };
    },
    updateCustomer: async () => customer,
    listContacts: async () => [] as ContactRecord[],
    createContact: async () => {
      throw new CrmError('NOT_FOUND', 'Customer not found.');
    },
    updateContact: async () => {
      throw new CrmError('NOT_FOUND', 'Contact not found.');
    },
    listOpportunities: async () => [] as OpportunityRecord[],
    createOpportunity: async () => {
      throw new CrmError('VALIDATION_ERROR', 'Amount cannot be negative.');
    },
    updateOpportunity: async () => {
      throw new CrmError('NOT_FOUND', 'Opportunity not found.');
    },
  };
  return { ...base, ...overrides };
}

function buildApp(service: CrmService): Hono {
  const app = new Hono();
  app.route('/', createCrmApiRoutes({ auth, crm: service }));
  return app;
}

describe('CRM API routes', () => {
  it('rejects an anonymous request', async () => {
    const app = buildApp(buildService());
    const response = await app.request('/customers');
    expect(response.status).toBe(401);
  });

  it('lists customers for a signed-in request', async () => {
    const app = buildApp(buildService());
    const response = await app.request('/customers', {
      headers: { 'x-test-session': 'yes' },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [customer] });
  });

  it('maps a validation failure to 400', async () => {
    const app = buildApp(buildService());
    const response = await app.request('/customers', {
      method: 'POST',
      headers: { 'x-test-session': 'yes', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'VALIDATION_ERROR',
      errors: { name: 'required' },
    });
  });

  it('maps a missing customer to 404', async () => {
    const app = buildApp(buildService());
    const response = await app.request('/customers/999', {
      headers: { 'x-test-session': 'yes' },
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('creates a customer and answers 201', async () => {
    const app = buildApp(buildService());
    const response = await app.request('/customers', {
      method: 'POST',
      headers: { 'x-test-session': 'yes', 'content-type': 'application/json' },
      body: JSON.stringify({ name: ' 蓝海制造 ' }),
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: 7, name: '蓝海制造' },
    });
  });

  it('passes the stage filter through to the service', async () => {
    const listOpportunities = vi.fn(async () => [] as OpportunityRecord[]);
    const app = buildApp(buildService({ listOpportunities }));
    await app.request('/opportunities?stage=won', {
      headers: { 'x-test-session': 'yes' },
    });
    expect(listOpportunities).toHaveBeenCalledWith('won');
  });
});
