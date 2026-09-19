// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseManager } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { authenticationToken } from '@nocobase/app-plugin-authentication';

import {
  createExpenseService,
  expenseServiceToken,
} from '../../server/providers/expense.js';
import { expenseApiRoutes } from '../../server/routes/expenses.js';
import {
  createTestDatabase,
  insertSubmittedReport,
  migrate,
  seedWorkflowFixtures,
} from '../helpers/expense-database.js';

function createTestAuth() {
  return {
    required: () => async (context: any, next: () => Promise<void>) => {
      const userId = context.req.header('x-test-user');
      if (!userId) {
        return context.json({ code: 'UNAUTHORIZED' }, 401);
      }
      context.set('auth', {
        user: { id: userId, name: userId },
        session: { expiresAt: new Date() },
      });
      await next();
    },
    optional: () => async (_context: any, next: () => Promise<void>) => next(),
  };
}

describe('expense API routes', () => {
  let database: DatabaseManager;
  let router: {
    request: (path: string, init?: RequestInit) => Promise<Response>;
  };

  beforeEach(async () => {
    database = createTestDatabase();
    await migrate(database);
    await seedWorkflowFixtures(database);
    const container = new ServiceContainer();
    container.instance(authenticationToken, createTestAuth() as never);
    container.instance(expenseServiceToken, createExpenseService(database));
    router = (await expenseApiRoutes.createRouter({
      container,
    } as never)) as unknown as typeof router;
  });

  afterEach(async () => {
    await database.destroy();
  });

  function jsonRequest(
    path: string,
    user: string | undefined,
    body?: unknown,
    method = 'POST',
  ): RequestInit {
    return {
      method,
      headers: {
        ...(user ? { 'x-test-user': user } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
  }

  it('rejects an anonymous request', async () => {
    const response = await router.request('/expenses/reports');
    expect(response.status).toBe(401);
  });

  it('returns an empty approval todo with allowed=false for a non-manager', async () => {
    const response = await router.request('/expenses/reports?scope=approvals', {
      headers: { 'x-test-user': 'u-e1' },
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: unknown[];
      meta: { allowed: boolean };
    };
    expect(payload.meta.allowed).toBe(false);
    expect(payload.data).toEqual([]);
  });

  it('runs the whole workflow over HTTP and blocks a duplicate payment', async () => {
    const created = await router.request(
      '/expenses/reports',
      jsonRequest('/expenses/reports', 'u-e1', {
        purpose: '出差',
        items: [
          {
            categoryId: 'c1',
            expenseDate: '2026-08-05',
            amount: 800,
            description: '高铁',
          },
        ],
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: { report: { id: string } };
    };
    const id = createdBody.data.report.id;

    const submitted = await router.request(
      `/expenses/reports/${id}/submit`,
      jsonRequest(`/expenses/reports/${id}/submit`, 'u-e1'),
    );
    expect(submitted.status).toBe(200);

    const approved = await router.request(
      `/expenses/reports/${id}/approve`,
      jsonRequest(`/expenses/reports/${id}/approve`, 'u-mgr1', {
        comment: '同意',
      }),
    );
    expect(approved.status).toBe(200);

    const paid = await router.request(
      `/expenses/reports/${id}/pay`,
      jsonRequest(`/expenses/reports/${id}/pay`, 'u-fin'),
    );
    expect(paid.status).toBe(200);

    const secondPay = await router.request(
      `/expenses/reports/${id}/pay`,
      jsonRequest(`/expenses/reports/${id}/pay`, 'u-fin'),
    );
    expect(secondPay.status).toBe(409);
    const error = (await secondPay.json()) as { error: { code: string } };
    expect(error.error.code).toBe('ALREADY_PAID');

    const payments = await database
      .query()
      .selectFrom('expensePayments')
      .select('id')
      .execute();
    expect(payments).toHaveLength(1);
  });

  it('forbids a manager from approving their own reimbursement', async () => {
    await insertSubmittedReport(database, {
      id: 'rpt-own',
      number: 'EXP-OWN-0001',
      employeeId: 'emp-mgr1',
      departmentId: 'd1',
      totalAmount: 100,
    });
    const response = await router.request(
      '/expenses/reports/rpt-own/approve',
      jsonRequest('/expenses/reports/rpt-own/approve', 'u-mgr1', {}),
    );
    expect(response.status).toBe(403);
    const error = (await response.json()) as { error: { code: string } };
    expect(error.error.code).toBe('SELF_APPROVAL_FORBIDDEN');
  });

  it('refuses to pay an unapproved reimbursement', async () => {
    const created = await router.request(
      '/expenses/reports',
      jsonRequest('/expenses/reports', 'u-e1', {
        purpose: '草稿',
        items: [
          {
            categoryId: 'c1',
            expenseDate: '2026-08-05',
            amount: 100,
            description: '',
          },
        ],
      }),
    );
    const createdBody = (await created.json()) as {
      data: { report: { id: string } };
    };
    const response = await router.request(
      `/expenses/reports/${createdBody.data.report.id}/pay`,
      jsonRequest(
        `/expenses/reports/${createdBody.data.report.id}/pay`,
        'u-fin',
      ),
    );
    expect(response.status).toBe(409);
    const error = (await response.json()) as { error: { code: string } };
    expect(error.error.code).toBe('NOT_APPROVED');
  });

  it('rejects a report without expense items', async () => {
    const response = await router.request(
      '/expenses/reports',
      jsonRequest('/expenses/reports', 'u-e1', { purpose: '空单', items: [] }),
    );
    expect(response.status).toBe(400);
  });
});
