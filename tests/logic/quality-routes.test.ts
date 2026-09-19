import type { Application } from '@nocobase/app-server/application';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { ServiceContainer } from '@nocobase/service-provider';

import {
  createQualityService,
  INSPECTOR_ROLE,
  QUALITY_SUPERVISOR_ROLE,
  qualityServiceToken,
} from '../../server/providers/quality.js';
import { qualityApiRoutes } from '../../server/routes/quality.js';
import {
  createQualityDatabase,
  type QualityTestDatabase,
} from './quality-test-helpers.js';

const SUPERVISOR = 'user-supervisor';
const INSPECTOR = 'user-inspector';

const ROLES = new Map<string, readonly string[]>([
  [SUPERVISOR, [QUALITY_SUPERVISOR_ROLE]],
  [INSPECTOR, [INSPECTOR_ROLE]],
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

  beforeEach(async () => {
    context = await createQualityDatabase();
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
    container.instance(
      qualityServiceToken,
      createQualityService({
        database: context.database,
        directory: {
          rolesForUser: (id) => Promise.resolve(ROLES.get(id) ?? []),
          listUsers: () =>
            Promise.resolve([{ id: SUPERVISOR, name: SUPERVISOR }]),
        },
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
});
