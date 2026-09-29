// @vitest-environment node
import type { Auth } from '@nocobase/app-plugin-authentication';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono, type Context, type Next } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  CrmServiceError,
  crmServiceToken,
  type ContactDto,
  type CrmService,
  type CustomerDetailDto,
  type CustomerDto,
  type OpportunityDto,
} from '../../server/providers/crm.js';
import { createCrmRoutes, apiRoutes } from '../../server/routes/crm.js';

const customer: CustomerDto = {
  id: 1,
  name: 'Aurora Robotics',
  industry: 'Industrial Automation',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const contact: ContactDto = {
  id: 10,
  name: 'Mia Chen',
  phone: null,
  email: null,
  customerId: 1,
  customerName: 'Aurora Robotics',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const opportunity: OpportunityDto = {
  id: 100,
  name: 'Production line retrofit',
  customerId: 1,
  customerName: 'Aurora Robotics',
  amount: 480000,
  stage: 'following',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const detail: CustomerDetailDto = {
  ...customer,
  contacts: [contact],
  opportunities: [opportunity],
  opportunityTotal: 480000,
};

function createCrmStub(): CrmService {
  return {
    listCustomers: vi.fn().mockResolvedValue([customer]),
    getCustomer: vi.fn().mockResolvedValue(detail),
    createCustomer: vi.fn().mockResolvedValue(customer),
    updateCustomer: vi.fn().mockResolvedValue(customer),
    listContacts: vi.fn().mockResolvedValue([contact]),
    getContact: vi.fn().mockResolvedValue(contact),
    createContact: vi.fn().mockResolvedValue(contact),
    updateContact: vi.fn().mockResolvedValue(contact),
    listOpportunities: vi.fn().mockResolvedValue([opportunity]),
    getOpportunity: vi.fn().mockResolvedValue(opportunity),
    createOpportunity: vi.fn().mockResolvedValue(opportunity),
    updateOpportunity: vi.fn().mockResolvedValue(opportunity),
  };
}

function createTestAuth(): Auth {
  return {
    required:
      () =>
      async (context: Context, next: Next): Promise<Response | void> => {
        if (context.req.header('x-test-user') !== 'signed-in') {
          return context.json({ code: 'UNAUTHENTICATED' }, 401);
        }

        await next();
      },
  } as unknown as Auth;
}

async function createRouter(crm: CrmService): Promise<Hono> {
  const container = new ServiceContainer();
  container.instance(authenticationToken, createTestAuth());
  container.instance(crmServiceToken, crm);

  const app = {
    appName: 'main',
    publicBasePath: '/main',
    config: { app: { name: 'main', publicBasePath: '/main' } },
    router: new Hono(),
    container,
  } as unknown as Application;

  return apiRoutes.createRouter(app);
}

function signedIn(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      'x-test-user': 'signed-in',
      'content-type': 'application/json',
    },
  });
}

describe('CRM routes', () => {
  it('rejects anonymous callers before they reach the service', async () => {
    const crm = createCrmStub();
    const router = await createRouter(crm);

    const response = await router.request('http://localhost/customers');

    expect(response.status).toBe(401);
    expect(crm.listCustomers).not.toHaveBeenCalled();
  });

  it('lists customers scoped to the router, not a global prefix', async () => {
    const crm = createCrmStub();
    const router = await createRouter(crm);

    const response = await router.request(signedIn('/customers'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [customer] });
    expect(crm.listCustomers).toHaveBeenCalledWith({ search: undefined });
  });

  it('forwards search, stage and customerId filters to the service', async () => {
    const crm = createCrmStub();
    const router = await createRouter(crm);

    const response = await router.request(
      signedIn('/opportunities?stage=won&search=aurora&customerId=1'),
    );

    expect(response.status).toBe(200);
    expect(crm.listOpportunities).toHaveBeenCalledWith({
      search: 'aurora',
      stage: 'won',
      customerId: 1,
    });
  });

  it('returns the customer aggregate the service computed', async () => {
    const crm = createCrmStub();
    const router = await createRouter(crm);

    const response = await router.request(signedIn('/customers/1'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: detail });
    expect(crm.getCustomer).toHaveBeenCalledWith(1);
  });

  it('creates a customer with 201 and forwards its body', async () => {
    const crm = createCrmStub();
    const router = await createRouter(crm);

    const response = await router.request(
      signedIn('/customers', {
        method: 'POST',
        body: JSON.stringify({ name: 'Aurora Robotics' }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ data: customer });
    expect(crm.createCustomer).toHaveBeenCalledWith({
      name: 'Aurora Robotics',
      industry: undefined,
    });
  });

  it('maps a service VALIDATION error to 422 with the field', async () => {
    const crm = createCrmStub();
    crm.createOpportunity = vi
      .fn()
      .mockRejectedValue(
        new CrmServiceError(
          'VALIDATION',
          'amount must not be negative.',
          'amount',
        ),
      );
    const router = await createRouter(crm);

    const response = await router.request(
      signedIn('/opportunities', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Bad deal',
          customerId: 1,
          amount: -1,
          stage: 'following',
        }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      code: 'VALIDATION',
      message: 'amount must not be negative.',
      field: 'amount',
    });
  });

  it('maps a service NOT_FOUND error to 404', async () => {
    const crm = createCrmStub();
    crm.getOpportunity = vi
      .fn()
      .mockRejectedValue(
        new CrmServiceError('NOT_FOUND', 'Opportunity not found.'),
      );
    const router = await createRouter(crm);

    const response = await router.request(signedIn('/opportunities/999'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a body that is not valid JSON with 422', async () => {
    const crm = createCrmStub();
    const router = await createRouter(crm);

    const response = await router.request(
      signedIn('/customers', {
        method: 'POST',
        body: '{',
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: 'VALIDATION',
    });
    expect(crm.createCustomer).not.toHaveBeenCalled();
  });
});

describe('createCrmRoutes', () => {
  it('keeps authentication on the router it owns', async () => {
    const crm = createCrmStub();
    const outer = new Hono();
    outer.route('/crm', createCrmRoutes({ auth: createTestAuth(), crm }));

    const response = await outer.request('http://localhost/crm/customers');

    expect(response.status).toBe(401);
  });
});
