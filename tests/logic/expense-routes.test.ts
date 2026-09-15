import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { expenseApiRoutes } from '../../server/routes/expense.js';
import {
  expenseFileContentRoutes,
  expenseFileUploadRoutes,
} from '../../server/routes/expense-files.js';
import {
  CLAIM_COLLECTION,
  expenseServiceToken,
  type ExpenseService,
} from '../../server/providers/expense-service.js';

type Decision = { effect: 'permit' | 'conditional' | 'deny' };

interface Harness {
  readonly router: Hono;
  readonly contentRouter: Hono;
  readonly uploadRouter: Hono;
  readonly expense: ReturnType<typeof createExpenseDouble>;
  setDecision(decision: Decision): void;
}

const PRINCIPAL = 'user-applicant';

function createExpenseDouble(): ExpenseService & {
  readonly calls: string[];
  claims: Map<number, Record<string, unknown>>;
  receipts: Map<number, Record<string, unknown>>;
  files: Map<string, Record<string, unknown>>;
} {
  const calls: string[] = [];
  const claims = new Map<number, Record<string, unknown>>();
  const receipts = new Map<number, Record<string, unknown>>();
  const files = new Map<string, Record<string, unknown>>();
  const notImplemented = (name: string) => async (): Promise<never> => {
    throw new Error(`${name} is not implemented in this double`);
  };
  return {
    calls,
    claims,
    receipts,
    files,
    listClaims: async () => [...claims.values()],
    getClaim: async (id) => claims.get(id) as never,
    createClaim: notImplemented('createClaim'),
    updateClaim: async () => 0,
    deleteClaim: async (id) => {
      calls.push(`deleteClaim:${id}`);
      return claims.delete(id) ? 1 : 0;
    },
    listReceipts: async () => [...receipts.values()],
    listReceiptsForClaim: async (claimId) => {
      calls.push(`listReceiptsForClaim:${claimId}`);
      return [...receipts.values()].filter(
        (receipt) => receipt.claimId === claimId,
      ) as never;
    },
    deleteReceiptsForClaim: async (claimId) => {
      calls.push(`deleteReceiptsForClaim:${claimId}`);
      let deleted = 0;
      for (const [id, receipt] of receipts) {
        if (receipt.claimId === claimId) {
          receipts.delete(id);
          deleted += 1;
        }
      }
      return deleted;
    },
    findReceiptByFileId: async (fileId, conditions) => {
      // The real implementation applies the caller's record filter; this double honours the applicant filter the
      // harness builds, so "belongs to someone else" and "does not exist" stay distinguishable.
      const owner = ownerOf(conditions);
      return [...receipts.values()].find(
        (receipt) =>
          receipt.fileId === fileId &&
          (owner === undefined || receipt.applicantId === owner),
      ) as never;
    },
    isReceiptFileAttached: async (fileId) =>
      [...receipts.values()].some((receipt) => receipt.fileId === fileId),
    findReceiptById: async (id) => receipts.get(id) as never,
    createReceipt: notImplemented('createReceipt'),
    deleteReceipt: async (id) => {
      calls.push(`deleteReceipt:${id}`);
      return receipts.delete(id) ? 1 : 0;
    },
    recalculateClaim: async () => ({ count: 0, total: 0 }),
    statistics: async () => [],
    getFileRecord: async (fileId) => files.get(fileId) as never,
    deleteFileRecord: async (fileId) => {
      calls.push(`deleteFileRecord:${fileId}`);
    },
    listDepartments: async () => [],
    getDepartment: notImplemented('getDepartment'),
    insertDepartment: notImplemented('insertDepartment'),
    updateDepartment: async () => 0,
    deleteDepartment: async () => 0,
    findDepartmentByName: async () => undefined,
    listClaimNumbers: async () => [],
  };
}

/** Extracts the applicant the harness's record filter pins, mirroring what the real service would apply. */
function ownerOf(
  conditions: { readonly filter?: unknown } | undefined,
): string | undefined {
  const filter = conditions?.filter as
    { $and?: { applicantId?: { $eq?: string } }[] } | undefined;
  return filter?.$and?.[0]?.applicantId?.$eq;
}

async function createHarness(): Promise<Harness> {
  const container = new ServiceContainer();
  const expense = createExpenseDouble();
  let decision: Decision = { effect: 'conditional' };

  const auth = {
    required:
      () =>
      async (context: never, next: () => Promise<void>): Promise<unknown> => {
        const anyContext = context as unknown as {
          req: { header(name: string): string | undefined };
          json(value: unknown, status?: number): Response;
          set(key: string, value: unknown): void;
        };
        const user = anyContext.req.header('x-test-user');
        if (!user) return anyContext.json({ code: 'UNAUTHORIZED' }, 401);
        anyContext.set('auth', {
          user: { id: user, name: user, email: `${user}@example.com` },
        });
        await next();
        return undefined;
      },
    getSession: async () => ({
      user: { id: PRINCIPAL, name: 'Applicant', email: 'a@example.com' },
    }),
  };

  const authorization = {
    middleware:
      () =>
      async (context: never, next: () => Promise<void>): Promise<void> => {
        const anyContext = context as unknown as {
          req: { header(name: string): string | undefined };
          set(key: string, value: unknown): void;
        };
        const user = anyContext.req.header('x-test-user') ?? PRINCIPAL;
        anyContext.set('authz', {
          identity: { principal: { type: 'user', id: user }, subjects: [] },
          authorize: async () =>
            decision.effect === 'deny'
              ? { effect: 'deny', reasons: [] }
              : {
                  effect: 'conditional',
                  conditions: {
                    type: 'database',
                    collection: CLAIM_COLLECTION,
                    action: 'read',
                    filter: { $and: [{ applicantId: { $eq: user } }] },
                    fields: { input: '*', output: '*' },
                  },
                  reasons: [],
                },
          can: async () => true,
          require: async () => undefined,
          explain: async () => decision,
          permissions: async () => ({ permissions: [] }),
        });
        await next();
      },
  };

  container.instance(authenticationToken, auth as never);
  container.instance(authorizationToken, authorization as never);
  container.instance(expenseServiceToken, expense as never);
  container.instance(serverFileRepositoryManagerToken, {
    repository: () => ({
      findOne: async () => undefined,
      getUrl: (record: { id: string; ext: string }) =>
        `/uploads/expense-receipts/${record.id}.${record.ext}`,
      getStorageUrl: async () => '',
      validateCollection: async () => undefined,
    }),
  } as never);

  const app = { container, publicBasePath: '/main' } as unknown as Application;

  return {
    router: (await expenseApiRoutes.createRouter(app)) as unknown as Hono,
    contentRouter: (await expenseFileContentRoutes.createRouter(
      app,
    )) as unknown as Hono,
    uploadRouter: (await expenseFileUploadRoutes.createRouter(
      app,
    )) as unknown as Hono,
    expense,
    setDecision: (next) => {
      decision = next;
    },
  };
}

describe('expense routes', () => {
  it('rejects anonymous list requests with 401', async () => {
    const harness = await createHarness();
    const response = await harness.router.request('/expense/claims');
    expect(response.status).toBe(401);
  });

  it('rejects an authenticated request the authorizer denies with 403', async () => {
    const harness = await createHarness();
    harness.setDecision({ effect: 'deny' });
    const response = await harness.router.request('/expense/claims', {
      headers: { 'x-test-user': PRINCIPAL },
    });
    expect(response.status).toBe(403);
  });

  it('returns the rows the authorizer allows', async () => {
    const harness = await createHarness();
    harness.expense.claims.set(1, {
      id: 1,
      number: 'BX-1',
      applicantId: PRINCIPAL,
      status: 'draft',
      totalAmount: 0,
      receiptCount: 0,
    });
    const response = await harness.router.request('/expense/claims', {
      headers: { 'x-test-user': PRINCIPAL },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { number: string }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].number).toBe('BX-1');
  });

  it('cancelling a draft removes its receipts and attachment records', async () => {
    const harness = await createHarness();
    harness.expense.claims.set(7, {
      id: 7,
      applicantId: PRINCIPAL,
      status: 'draft',
    });
    harness.expense.receipts.set(11, {
      id: 11,
      claimId: 7,
      fileId: 'file-a',
    });
    harness.expense.receipts.set(12, {
      id: 12,
      claimId: 7,
      fileId: 'file-b',
    });

    const response = await harness.router.request('/expense/claims/7', {
      method: 'DELETE',
      headers: { 'x-test-user': PRINCIPAL },
    });

    expect(response.status).toBe(200);
    expect(harness.expense.calls).toContain('deleteReceiptsForClaim:7');
    expect(harness.expense.calls).toContain('deleteFileRecord:file-a');
    expect(harness.expense.calls).toContain('deleteFileRecord:file-b');
    expect(harness.expense.calls).toContain('deleteClaim:7');
    expect(harness.expense.claims.has(7)).toBe(false);
    expect(harness.expense.receipts.size).toBe(0);
  });

  it('refuses an attachment whose receipt is gone or not visible', async () => {
    const harness = await createHarness();
    const anonymous = await harness.contentRouter.request(
      '/uploads/expense-receipts/11111111-1111-4111-8111-111111111111.pdf',
    );
    expect(anonymous.status).toBe(401);

    const denied = await harness.contentRouter.request(
      '/uploads/expense-receipts/11111111-1111-4111-8111-111111111111.pdf',
      { headers: { 'x-test-user': 'someone-else' } },
    );
    expect(denied.status).toBe(403);
  });

  it('refuses a receipt that was cancelled even when the caller is the applicant', async () => {
    const harness = await createHarness();
    // Cancelling a claim deletes its receipts and then their file records. While the receipt row is gone and the
    // file record still exists, the stale address must not start working again.
    harness.expense.files.set('file-cancelled', { id: 'file-cancelled' });
    harness.expense.receipts.set(21, {
      id: 21,
      claimId: 7,
      fileId: 'file-elsewhere',
    });
    const response = await harness.contentRouter.request(
      '/uploads/expense-receipts/file-elsewhere.png',
      { headers: { 'x-test-user': PRINCIPAL } },
    );
    expect(response.status).toBe(403);
  });

  it('serves a file no claim has claimed yet so the upload control can preview it', async () => {
    const harness = await createHarness();
    harness.expense.files.set('file-fresh', { id: 'file-fresh', ext: 'png' });
    const response = await harness.contentRouter.request(
      '/uploads/expense-receipts/file-fresh.png',
      { headers: { 'x-test-user': PRINCIPAL } },
    );
    // The guard lets it through; the repository below it decides the response, which is never a refusal here.
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });

  /**
   * Both file routers mount at a shared prefix — the content router at `/`, the upload router at `/api`. A guard
   * registered as `use('*')` matches every path under that prefix, not just the paths this contribution owns, and
   * runs before any handler registered later. The server registers the SPA routes after these contributions, so a
   * catch-all here answered every page request with 401 before the SPA was ever reached.
   */
  it('guards only the content path, leaving other root paths to later contributions', async () => {
    const harness = await createHarness();
    for (const path of [
      '/',
      '/main',
      '/main/expense/claims',
      '/main/assets/app.js',
    ]) {
      const response = await harness.contentRouter.request(path);
      expect(
        response.status,
        `${path} must not be guarded by the content route`,
      ).toBe(404);
      expect(await response.text()).not.toContain('UNAUTHORIZED');
    }
    const owned = await harness.contentRouter.request(
      '/uploads/expense-receipts/11111111-1111-4111-8111-111111111111.pdf',
    );
    expect(owned.status).toBe(401);
  });

  it('guards only the upload endpoint, leaving other api paths to later contributions', async () => {
    const harness = await createHarness();
    for (const path of ['/', '/auth/sign-in/username', '/expense/claims']) {
      const response = await harness.uploadRouter.request(path, {
        method: 'POST',
      });
      expect(
        response.status,
        `${path} must not be guarded by the upload route`,
      ).toBe(404);
      expect(await response.text()).not.toContain('UNAUTHORIZED');
    }
    const owned = await harness.uploadRouter.request(
      '/expenseReceiptFiles:uploadOne',
      { method: 'POST' },
    );
    expect(owned.status).toBe(401);
  });
});
