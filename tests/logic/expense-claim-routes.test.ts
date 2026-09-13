import { randomUUID } from 'node:crypto';

import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  serverFileRepositoryManagerToken,
  type ServerFileRepositoryManager,
} from '@nocobase/app-plugin-file/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createExpenseClaimFileRoutes } from '../../server/routes/expense-claim-files.js';
import { expenseClaimRoutes } from '../../server/routes/expense-claims.js';
import {
  ExpenseClaimService,
  expenseClaimServiceToken,
} from '../../server/providers/expense-claims.js';
import {
  createTestDatabase,
  migrate,
  type TestDatabase,
} from '../helpers/test-database.js';

const AUTHORIZED = { 'x-test-user': 'user-1' };

function createFakeAuth(): Auth {
  return {
    required: (options) => async (context, next) => {
      if (options?.skip?.(context)) {
        await next();
        return;
      }
      if (context.req.header('x-test-user')) {
        await next();
        return;
      }
      return context.json({ code: 'UNAUTHORIZED' }, 401);
    },
  } as unknown as Auth;
}

function createFakeFileManager(): ServerFileRepositoryManager {
  return {
    repository: () => ({
      validateCollection: async () => undefined,
      getUrl: (record: { id: string; ext: string }) =>
        `/uploads/expense-claims/${record.id}${record.ext ? `.${record.ext}` : ''}`,
    }),
  } as unknown as ServerFileRepositoryManager;
}

describe('expense claim routes', () => {
  let database: TestDatabase;
  let container: ServiceContainer;
  let businessRouter: Awaited<
    ReturnType<typeof expenseClaimRoutes.createRouter>
  >;
  // API contributions mount at `/api` on the application router; mirror that
  // here so the paths the guard sees match production.
  let fileApiHost: Hono;
  let fileRootRouter: Awaited<
    ReturnType<
      ReturnType<typeof createExpenseClaimFileRoutes>[number]['createRouter']
    >
  >;

  beforeAll(async () => {
    database = createTestDatabase();
    await migrate(database.manager);

    container = new ServiceContainer();
    container.instance(authenticationToken, createFakeAuth());
    container.instance(
      expenseClaimServiceToken,
      new ExpenseClaimService(database.manager),
    );
    container.instance(
      serverFileRepositoryManagerToken,
      createFakeFileManager(),
    );
    container.instance(databaseManagerToken, {
      repository: () => ({}),
    } as unknown as DatabaseManager);

    const app = {
      container,
      publicBasePath: '/main',
    } as unknown as Application;

    businessRouter = await expenseClaimRoutes.createRouter(app);
    const fileRoutes = createExpenseClaimFileRoutes();
    fileApiHost = new Hono();
    fileApiHost.route('/api', await fileRoutes[0].createRouter(app));
    fileRootRouter = await fileRoutes[1].createRouter(app);
  });

  afterAll(async () => {
    await database.dispose();
  });

  beforeEach(async () => {
    await database.manager
      .query('main')
      .deleteFrom('expenseClaimAttachments')
      .allowAllRows()
      .execute();
    await database.manager
      .query('main')
      .deleteFrom('expenseClaims')
      .allowAllRows()
      .execute();
    await database.manager
      .query('main')
      .deleteFrom('expenseClaimFiles')
      .allowAllRows()
      .execute();
  });

  async function insertReceiptFile(): Promise<string> {
    const id = randomUUID();
    const now = new Date();
    await database.manager
      .query('main')
      .insertInto('expenseClaimFiles')
      .values({
        id,
        disk: 'local',
        key: `objects/${id}.txt`,
        filename: 'invoice.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 12,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return id;
  }

  it('rejects anonymous access to every business endpoint', async () => {
    expect((await businessRouter.request('/expense-claims')).status).toBe(401);
    expect(
      (
        await businessRouter.request('/expense-claims', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(401);
    expect((await businessRouter.request('/expense-claims/1')).status).toBe(
      401,
    );
  });

  it('creates a claim and returns it with download URLs', async () => {
    const fileId = await insertReceiptFile();
    const response = await businessRouter.request('/expense-claims', {
      method: 'POST',
      headers: { ...AUTHORIZED, 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: 'Team lunch',
        amount: 128.5,
        expenseDate: '2026-09-10',
        attachmentIds: [fileId],
      }),
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      data: { id: number; attachments: { contentUrl: string }[] };
    };
    expect(payload.data.id).toBeGreaterThan(0);
    expect(payload.data.attachments[0].contentUrl).toBe(
      `/main/uploads/expense-claims/${fileId}.txt`,
    );

    const detail = await businessRouter.request(
      `/expense-claims/${payload.data.id}`,
      { headers: AUTHORIZED },
    );
    expect(detail.status).toBe(200);
    const detailPayload = (await detail.json()) as {
      data: { reason: string; attachments: { filename: string }[] };
    };
    expect(detailPayload.data.reason).toBe('Team lunch');
    expect(detailPayload.data.attachments[0].filename).toBe('invoice.txt');
  });

  it('rejects an invalid claim body', async () => {
    const response = await businessRouter.request('/expense-claims', {
      method: 'POST',
      headers: { ...AUTHORIZED, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: '', amount: -1, expenseDate: 'nope' }),
    });
    expect(response.status).toBe(400);
  });

  it('returns 404 for a missing claim', async () => {
    const response = await businessRouter.request('/expense-claims/4242', {
      headers: AUTHORIZED,
    });
    expect(response.status).toBe(404);
  });

  it('protects the generated file upload and download routes', async () => {
    expect(
      (
        await fileApiHost.request('/api/expenseClaimFiles:findMany', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(401);

    expect(
      (
        await fileRootRouter.request(
          `/uploads/expense-claims/${randomUUID()}.txt`,
        )
      ).status,
    ).toBe(401);
  });

  it('leaves paths it does not own alone', async () => {
    // The wrapper is mounted at `/api` and `/`; a `use('*')` guard would have
    // made these 401 and locked out sign-in and the whole SPA (the failure the
    // factory smoke hit at `/main/`).
    expect((await fileApiHost.request('/api/auth:signIn')).status).toBe(404);
    expect((await fileApiHost.request('/api/expense-claims')).status).toBe(404);
    expect((await fileRootRouter.request('/')).status).toBe(404);
    expect((await fileRootRouter.request('/some-app-page')).status).toBe(404);
  });
});
