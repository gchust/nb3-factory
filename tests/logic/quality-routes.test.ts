// @vitest-environment node
import type { Application } from '@nocobase/app-server/application';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { ServiceContainer } from '@nocobase/service-provider';

import {
  createQualityService,
  INSPECTOR_ROLE,
  PRODUCTION_LEAD_ROLE,
  QUALITY_SUPERVISOR_ROLE,
  qualityServiceToken,
} from '../../server/providers/quality.js';
import {
  createQualityFileService,
  qualityFileServiceToken,
} from '../../server/providers/quality-files.js';
import { qualityApiRoutes } from '../../server/routes/quality.js';
import {
  createMemoryAttachmentStorage,
  createMemoryAttachmentStore,
  createQualityDatabase,
  type MemoryAttachmentStorage,
  type QualityTestDatabase,
} from './quality-test-helpers.js';

const SUPERVISOR = 'user-supervisor';
const INSPECTOR = 'user-inspector';
const INSPECTOR_TWO = 'user-inspector-2';
const LEAD = 'user-lead';
const NOBODY = 'user-nobody';

const ROLES = new Map<string, readonly string[]>([
  [SUPERVISOR, [QUALITY_SUPERVISOR_ROLE]],
  [INSPECTOR, [INSPECTOR_ROLE]],
  [INSPECTOR_TWO, [INSPECTOR_ROLE]],
  [LEAD, [PRODUCTION_LEAD_ROLE]],
  [NOBODY, []],
]);

interface TestSession {
  readonly user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  readonly session: { expiresAt: Date };
}

function sessionFor(id: string): TestSession {
  return {
    user: {
      id,
      name: id,
      email: `${id}@example.invalid`,
      emailVerified: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
    session: { expiresAt: new Date(Date.now() + 60_000) },
  };
}

function createAuthStub(session: TestSession | null) {
  return {
    required() {
      return async (
        context: {
          json: (body: unknown, status: number) => Response;
          set: (key: string, value: unknown) => void;
        },
        next: () => Promise<void>,
      ): Promise<Response | undefined> => {
        if (!session) {
          return context.json(
            { code: 'UNAUTHORIZED', message: 'Authentication required' },
            401,
          );
        }
        context.set('auth', session);
        await next();
        return undefined;
      };
    },
  };
}

describe('quality API routes', () => {
  let context: QualityTestDatabase;
  let storage: MemoryAttachmentStorage;

  beforeEach(async () => {
    context = await createQualityDatabase();
    storage = createMemoryAttachmentStorage();
    const now = new Date();
    await context.connection.query
      .insertInto('products')
      .values({
        id: 'product-1',
        code: 'P-1',
        name: 'Product',
        specification: null,
        unit: '件',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await context.connection.query
      .insertInto('productionBatches')
      .values({
        id: 'batch-1',
        batchNo: 'B-1',
        productId: 'product-1',
        quantity: 10,
        productionLine: null,
        producedAt: now,
        status: 'completed',
        createdById: SUPERVISOR,
        remark: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  });

  afterEach(async () => {
    await context.dispose();
  });

  async function request(
    userId: string | null,
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    const container = new ServiceContainer();
    container.instance(
      authenticationToken,
      createAuthStub(userId ? sessionFor(userId) : null) as never,
    );
    const directory = {
      rolesForUser: (id: string) => Promise.resolve(ROLES.get(id) ?? []),
      listUsers: () => Promise.resolve([{ id: SUPERVISOR, name: SUPERVISOR }]),
    };
    container.instance(
      qualityServiceToken,
      createQualityService({ database: context.database, directory }),
    );
    container.instance(
      qualityFileServiceToken,
      createQualityFileService({
        database: context.database,
        directory,
        store: createMemoryAttachmentStore(context, storage),
        storage,
      }),
    );
    const router = await qualityApiRoutes.createRouter({
      container,
    } as unknown as Application);
    return router.request(path, init);
  }

  it('rejects an anonymous request with 401', async () => {
    const response = await request(null, '/quality/session');
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns the signed-in session with its capabilities', async () => {
    const response = await request(SUPERVISOR, '/quality/session');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { capabilities: { supervise: boolean } };
    };
    expect(body.data.capabilities.supervise).toBe(true);
  });

  it('returns 403 when the role is not permitted', async () => {
    const response = await request(INSPECTOR, '/quality/stats/pass-rate');
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns the permitted payload', async () => {
    const response = await request(INSPECTOR, '/quality/products');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: readonly { code: string }[];
    };
    expect(body.data.map((row) => row.code)).toEqual(['P-1']);
  });

  it('rejects an invalid body with 400', async () => {
    const response = await request(SUPERVISOR, '/quality/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Missing code' }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('creates a product for the supervisor', async () => {
    const response = await request(SUPERVISOR, '/quality/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'P-2', name: 'Second', unit: '件' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { code: string } };
    expect(body.data.code).toBe('P-2');
  });

  it('does not let an inspector create a product', async () => {
    const response = await request(INSPECTOR, '/quality/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'P-3', name: 'Third', unit: '件' }),
    });
    expect(response.status).toBe(403);
  });

  it('rejects malformed JSON with 400', async () => {
    const response = await request(SUPERVISOR, '/quality/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(response.status).toBe(400);
  });

  it('serves batches and tasks to a signed-in caller', async () => {
    const batches = await request(SUPERVISOR, '/quality/batches');
    const tasks = await request(SUPERVISOR, '/quality/tasks');
    expect(batches.status).toBe(200);
    expect(tasks.status).toBe(200);
  });

  it('rejects an anonymous attachment request with 401', async () => {
    const response = await request(
      null,
      '/quality/attachments?targetType=batch&targetId=batch-1&category=batch_factory_report',
    );
    expect(response.status).toBe(401);
  });

  it('uploads, lists, streams and removes a batch factory report', async () => {
    const form = new FormData();
    form.set(
      'file',
      new File(['报告内容'], '报告.txt', { type: 'text/plain' }),
    );
    form.set('targetType', 'batch');
    form.set('targetId', 'batch-1');
    form.set('category', 'batch_factory_report');
    const uploaded = await request(SUPERVISOR, '/quality/attachments', {
      method: 'POST',
      body: form,
    });
    expect(uploaded.status).toBe(200);
    const created = (await uploaded.json()) as {
      data: {
        id: string;
        filename: string;
        size: number;
        uploadedById: string;
      };
    };
    expect(created.data.filename).toBe('报告.txt');
    expect(created.data.size).toBe(Buffer.byteLength('报告内容'));
    expect(created.data.uploadedById).toBe(SUPERVISOR);

    const list = await request(
      INSPECTOR,
      '/quality/attachments?targetType=batch&targetId=batch-1&category=batch_factory_report',
    );
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as {
      data: { files: readonly { id: string }[]; canModify: boolean };
    };
    expect(listBody.data.files.map((file) => file.id)).toEqual([
      created.data.id,
    ]);
    expect(listBody.data.canModify).toBe(false);

    const content = await request(
      INSPECTOR,
      `/quality/attachments/${created.data.id}/content`,
    );
    expect(content.status).toBe(200);
    expect(await content.text()).toBe('报告内容');

    const denied = await request(
      NOBODY,
      `/quality/attachments/${created.data.id}/content`,
    );
    expect(denied.status).toBe(403);

    const download = await request(
      INSPECTOR,
      `/quality/attachments/${created.data.id}/download`,
    );
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toContain('attachment');

    const removed = await request(
      SUPERVISOR,
      `/quality/attachments/${created.data.id}`,
      { method: 'DELETE' },
    );
    expect(removed.status).toBe(200);
    const after = await request(
      SUPERVISOR,
      `/quality/attachments/${created.data.id}/content`,
    );
    expect(after.status).toBe(404);
  });

  it('rejects an attachment upload with an invalid category', async () => {
    const form = new FormData();
    form.set('file', new File(['x'], 'x.txt', { type: 'text/plain' }));
    form.set('targetType', 'batch');
    form.set('targetId', 'batch-1');
    form.set('category', 'item_photo');
    const response = await request(SUPERVISOR, '/quality/attachments', {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('rejects an oversized attachment with 413', async () => {
    const form = new FormData();
    form.set(
      'file',
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.bin', {
        type: 'application/octet-stream',
      }),
    );
    form.set('targetType', 'batch');
    form.set('targetId', 'batch-1');
    form.set('category', 'batch_factory_report');
    const response = await request(SUPERVISOR, '/quality/attachments', {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(413);
  });

  it('rejects an invalid round selector with 400', async () => {
    const response = await request(
      SUPERVISOR,
      '/quality/attachments?targetType=batch&targetId=batch-1&category=batch_factory_report&round=abc',
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('lets only the supervisor reassign a task and returns the new assignment', async () => {
    const created = await request(SUPERVISOR, '/quality/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        batchId: 'batch-1',
        inspectorId: INSPECTOR,
        assignedLeadId: LEAD,
        sampleSize: 5,
        items: [{ name: '外径' }],
      }),
    });
    expect(created.status).toBe(200);
    const task = (await created.json()) as { data: { id: string } };

    const forbidden = await request(
      INSPECTOR,
      `/quality/tasks/${task.data.id}/assignment`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inspectorId: INSPECTOR_TWO }),
      },
    );
    expect(forbidden.status).toBe(403);

    const reassigned = await request(
      SUPERVISOR,
      `/quality/tasks/${task.data.id}/assignment`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inspectorId: INSPECTOR_TWO }),
      },
    );
    expect(reassigned.status).toBe(200);
    const body = (await reassigned.json()) as {
      data: { inspectorId: string };
    };
    expect(body.data.inspectorId).toBe(INSPECTOR_TWO);
  });
});
