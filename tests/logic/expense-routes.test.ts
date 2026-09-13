import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import { ExpenseError } from '../../server/providers/expense-domain.js';
import { expenseServiceToken } from '../../server/providers/expense-service.js';
import { expenseApiRoutes } from '../../server/routes/expense.js';

function createFakeAuth() {
  return {
    required:
      () =>
      async (
        context: {
          req: { header(name: string): string | undefined };
          json(body: unknown, status: number): Response;
          set(key: string, value: unknown): void;
        },
        next: () => Promise<void>,
      ) => {
        const userId = context.req.header('x-test-user');
        if (!userId) return context.json({ message: 'Unauthorized' }, 401);
        context.set('auth', { user: { id: userId }, session: {} });
        await next();
      },
  };
}

async function createRouter(service: Record<string, unknown>): Promise<{
  request(path: string, init?: RequestInit): Promise<Response>;
}> {
  const container = new ServiceContainer();
  container.instance(authenticationToken, createFakeAuth() as never);
  container.instance(expenseServiceToken, service as never);
  const router = await expenseApiRoutes.createRouter({
    container,
    publicBasePath: '/main',
    appName: 'main',
  } as never);
  return router as never;
}

describe('expense API authentication and authorization', () => {
  it('rejects anonymous requests with 401', async () => {
    const router = await createRouter({});
    const response = await router.request('/expense/claims');
    expect(response.status).toBe(401);
  });

  it("returns the caller's claims for an authenticated request", async () => {
    const listClaims = vi.fn(async () => [
      { id: 1, number: 'BX-1', status: 'pending' },
    ]);
    const router = await createRouter({ listClaims });
    const response = await router.request('/expense/claims', {
      headers: { 'x-test-user': 'user-1' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [{ id: 1, number: 'BX-1', status: 'pending' }],
    });
    expect(listClaims).toHaveBeenCalledWith('user-1');
  });

  it('surfaces a service authorization failure as 403', async () => {
    const listApprovalQueue = vi.fn(async () => {
      throw new ExpenseError(
        'FORBIDDEN',
        'Only the department manager may approve.',
        403,
      );
    });
    const router = await createRouter({ listApprovalQueue });
    const response = await router.request('/expense/approvals', {
      headers: { 'x-test-user': 'user-2' },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'FORBIDDEN' });
  });
});
