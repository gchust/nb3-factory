// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Auth, AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { MiddlewareHandler } from 'hono';

import migration from '../../database/main/migrations/202609020001_create_customer_memos.js';
import { createCustomerMemoRoutes } from '../../server/routes/customer-memos.js';
import {
  createCustomerMemoService,
  type CustomerMemoService,
} from '../../server/providers/customer-memos.js';
import {
  createTestDatabase,
  type TestDatabase,
} from './support/customer-memo-database.js';

const authorization = { authorization: 'Bearer test-token' };

/**
 * A stand-in for the authentication plugin: it reads one header and rejects
 * everything else. The real plugin owns the session, which is not what these
 * tests are about — they check that every customer memo endpoint requires
 * *some* authenticated caller and that an anonymous one is turned away.
 */
const requireAuth: MiddlewareHandler<AuthEnv> = async (context, next) => {
  if (context.req.header('authorization') !== authorization.authorization) {
    return context.json({ code: 'UNAUTHENTICATED' }, 401);
  }
  await next();
};

const auth = { required: () => requireAuth } as unknown as Auth;

interface JsonBody {
  readonly data?: Record<string, unknown>;
  readonly code?: string;
}

async function json(response: Response): Promise<JsonBody> {
  return (await response.json()) as JsonBody;
}

describe('customer memo API', () => {
  let db: TestDatabase;
  let service: CustomerMemoService;

  beforeEach(async () => {
    db = await createTestDatabase();
    await migration.up({
      builder: db.connection.builder,
    } as unknown as Parameters<typeof migration.up>[0]);
    service = createCustomerMemoService({ database: db.database });
  });

  afterEach(async () => {
    await db.dispose();
  });

  describe('service', () => {
    it('creates, reads, updates and deletes a memo', async () => {
      const created = await service.create({
        name: 'Acme Components Ltd.',
        notes: 'Prefers email.',
      });
      expect(created).toMatchObject({
        name: 'Acme Components Ltd.',
        notes: 'Prefers email.',
      });
      expect(typeof created.id).toBe('number');
      expect(new Date(created.createdAt).toString()).not.toBe('Invalid Date');

      expect(await service.get(created.id)).toEqual(created);
      expect(await service.get(created.id + 1)).toBeUndefined();

      const updated = await service.update(created.id, {
        name: 'Acme Components PLC',
        notes: null,
      });
      expect(updated).toEqual({
        ...created,
        name: 'Acme Components PLC',
        notes: null,
      });

      expect(
        await service.update(created.id + 1, { name: 'Nobody' }),
      ).toBeUndefined();

      expect(await service.remove(created.id)).toBe(true);
      expect(await service.get(created.id)).toBeUndefined();
      expect(await service.remove(created.id)).toBe(false);
    });

    it('lists newest first', async () => {
      await service.create({ name: 'First' });
      await service.create({ name: 'Second' });
      await service.create({ name: 'Third' });

      const list = await service.list();
      expect(list).toHaveLength(3);
      for (let index = 1; index < list.length; index += 1) {
        expect(
          new Date(list[index - 1].createdAt).getTime(),
        ).toBeGreaterThanOrEqual(new Date(list[index].createdAt).getTime());
      }
    });
  });

  describe('routes', () => {
    it('rejects anonymous requests on every endpoint', async () => {
      const router = createCustomerMemoRoutes({ auth, service });

      for (const [method, path] of [
        ['GET', '/customer-memos'],
        ['POST', '/customer-memos'],
        ['GET', '/customer-memos/1'],
        ['PUT', '/customer-memos/1'],
        ['DELETE', '/customer-memos/1'],
      ] as const) {
        const response = await router.request(path, { method });
        expect(response.status).toBe(401);
      }
    });

    it('creates, lists, reads, updates and deletes over HTTP', async () => {
      const router = createCustomerMemoRoutes({ auth, service });

      const createResponse = await router.request('/customer-memos', {
        method: 'POST',
        headers: { ...authorization, 'content-type': 'application/json' },
        body: JSON.stringify({ name: '  Acme  ', notes: '  note  ' }),
      });
      expect(createResponse.status).toBe(201);
      const created = (await json(createResponse)).data as {
        id: number;
        name: string;
        notes: string;
      };
      expect(created.name).toBe('Acme');
      expect(created.notes).toBe('note');

      const listResponse = await router.request('/customer-memos', {
        headers: authorization,
      });
      expect(listResponse.status).toBe(200);
      expect((await json(listResponse)).data).toHaveLength(1);

      const getResponse = await router.request(
        `/customer-memos/${created.id}`,
        { headers: authorization },
      );
      expect(getResponse.status).toBe(200);

      const updateResponse = await router.request(
        `/customer-memos/${created.id}`,
        {
          method: 'PUT',
          headers: { ...authorization, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Acme Components' }),
        },
      );
      expect(updateResponse.status).toBe(200);
      expect((await json(updateResponse)).data?.name).toBe('Acme Components');

      const deleteResponse = await router.request(
        `/customer-memos/${created.id}`,
        { method: 'DELETE', headers: authorization },
      );
      expect(deleteResponse.status).toBe(204);

      const missingResponse = await router.request(
        `/customer-memos/${created.id}`,
        { headers: authorization },
      );
      expect(missingResponse.status).toBe(404);
    });

    it('refuses to save an empty customer name with a clear code', async () => {
      const router = createCustomerMemoRoutes({ auth, service });
      const post = (body: string) =>
        router.request('/customer-memos', {
          method: 'POST',
          headers: { ...authorization, 'content-type': 'application/json' },
          body,
        });

      expect(
        (await json(await post(JSON.stringify({ name: '   ' })))).code,
      ).toBe('NAME_REQUIRED');
      expect((await post(JSON.stringify({ name: '   ' }))).status).toBe(400);
      expect((await post(JSON.stringify({ notes: 'no name' }))).status).toBe(
        400,
      );
      expect((await post('not json')).status).toBe(400);
    });

    it('reports invalid and missing ids distinctly', async () => {
      const router = createCustomerMemoRoutes({ auth, service });

      const invalid = await router.request('/customer-memos/abc', {
        method: 'DELETE',
        headers: authorization,
      });
      expect(invalid.status).toBe(400);
      expect((await json(invalid)).code).toBe('INVALID_ID');

      const missing = await router.request('/customer-memos/999', {
        method: 'DELETE',
        headers: authorization,
      });
      expect(missing.status).toBe(404);
      expect((await json(missing)).code).toBe('NOT_FOUND');
    });

    // An update must not be able to blank an existing name either.
    it('rejects an update that clears the customer name', async () => {
      const created = await service.create({ name: 'Keep me' });
      const router = createCustomerMemoRoutes({ auth, service });

      const response = await router.request(`/customer-memos/${created.id}`, {
        method: 'PATCH',
        headers: { ...authorization, 'content-type': 'application/json' },
        body: JSON.stringify({ name: '  ' }),
      });
      expect(response.status).toBe(400);
      expect(await service.get(created.id)).toMatchObject({ name: 'Keep me' });
    });
  });
});
