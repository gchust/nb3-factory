// @vitest-environment node
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  createAppDatabaseManager,
  resolveDatabaseConfig,
} from '@nocobase/app-server/database';
import {
  databaseManagerToken,
  type DatabaseManager,
  type MigrationContext,
  type SeedContext,
} from '@nocobase/db';
import { Hono, type Context } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202608270001_create_customer_memos.js';
import seed from '../../database/main/seeds/202608270002_customer_memos_sample_records.js';
import { apiRoutes } from '../../server/routes/customer-memos.js';

/**
 * The endpoints are exercised through the real router against a real SQLite
 * database that the real migration and seed built. Only the authentication
 * service is replaced: the test session is a request header, so these tests can
 * cover anonymous access, validation, CRUD, search and persistence without
 * standing up the whole application.
 */
const AUTHENTICATED = 'tester';

let directory: string;
let database: DatabaseManager;
let app: Hono;

const authentication = {
  required:
    () =>
    async (
      context: Context,
      next: () => Promise<void>,
    ): Promise<Response | void> => {
      if (!context.req.header('x-test-user')) {
        return context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        );
      }
      await next();
    },
};

function migrationContext(): MigrationContext {
  return {
    builder: database.builder('main'),
    query: database.query('main'),
    repository: (collection: string) => database.repository(collection, 'main'),
    connection: database.connection('main'),
    config: {},
    container: {},
  } as unknown as MigrationContext;
}

function seedContext(): SeedContext {
  return {
    query: database.query('main'),
    repository: (collection: string) => database.repository(collection, 'main'),
    connection: database.connection('main'),
    config: {},
    container: {},
  } as unknown as SeedContext;
}

async function request(
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  return app.request(pathname, {
    ...init,
    headers: { 'x-test-user': AUTHENTICATED, ...(init.headers ?? {}) },
  });
}

async function sendJson(
  pathname: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<Response> {
  return request(pathname, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as { data: T };
  return payload.data;
}

interface MemoDto {
  readonly id: string;
  readonly name: string;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), 'customer-memos-api-'));
  const config = await resolveDatabaseConfig({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'database.sqlite'),
        schemaManagement: 'managed',
        debug: false,
      },
    },
  });
  const manager = createAppDatabaseManager(config);
  if (!manager) throw new Error('The test database manager was not created.');
  database = manager;
  await database.connect('main');
  await migration.up(migrationContext());

  const fakeApplication = {
    container: {
      resolve: (token: unknown) => {
        if (token === authenticationToken) return authentication;
        if (token === databaseManagerToken) return database;
        throw new Error('Unexpected service token in the test container.');
      },
    },
  } as unknown as Application;

  app = new Hono();
  app.route('/api', await apiRoutes.createRouter(fakeApplication));
});

afterAll(async () => {
  await database?.destroy();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe('customer memo endpoints', () => {
  it('refuses anonymous requests on every path it owns', async () => {
    for (const pathname of [
      '/api/customer-memos',
      '/api/customer-memos/some-id',
    ]) {
      const response = await app.request(pathname);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    }
    expect(
      (
        await app.request('/api/customer-memos', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'x' }),
        })
      ).status,
    ).toBe(401);
  });

  it('seeds three sample memos once and does not duplicate them on a second run', async () => {
    await seed.run(seedContext());
    await seed.run(seedContext());

    const response = await request('/api/customer-memos');
    expect(response.status).toBe(200);
    const memos = await readData<MemoDto[]>(response);
    expect(memos).toHaveLength(3);
    // Newest first: 晨曦制造 (2026-07-15), 云梯网络 (2026-07-08), 星海科技 (2026-07-01).
    expect(memos.map((memo) => memo.name)).toEqual([
      '晨曦制造',
      '云梯网络',
      '星海科技',
    ]);
    expect(memos.map((memo) => memo.notes)).toEqual([
      expect.any(String),
      expect.any(String),
      expect.any(String),
    ]);
  });

  it('rejects a memo without a customer name', async () => {
    const missing = await sendJson('/api/customer-memos', 'POST', {
      notes: '没有名称',
    });
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({
      code: 'CUSTOMER_MEMO_NAME_REQUIRED',
    });

    const blank = await sendJson('/api/customer-memos', 'POST', {
      name: '   ',
    });
    expect(blank.status).toBe(400);
    await expect(blank.json()).resolves.toMatchObject({
      code: 'CUSTOMER_MEMO_NAME_REQUIRED',
    });

    const tooLong = await sendJson('/api/customer-memos', 'POST', {
      name: 'a'.repeat(256),
    });
    expect(tooLong.status).toBe(400);
    await expect(tooLong.json()).resolves.toMatchObject({
      code: 'CUSTOMER_MEMO_NAME_TOO_LONG',
    });
  });

  it('creates a memo, trims its text and keeps it after a fresh read', async () => {
    const response = await sendJson('/api/customer-memos', 'POST', {
      name: '  新客户  ',
      notes: '  第一次拜访  ',
    });
    expect(response.status).toBe(201);
    const created = await readData<MemoDto>(response);
    expect(created.name).toBe('新客户');
    expect(created.notes).toBe('第一次拜访');
    expect(created.createdAt).toBe(created.updatedAt);
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);

    const withoutNotes = await sendJson('/api/customer-memos', 'POST', {
      name: 'No notes',
    });
    expect(withoutNotes.status).toBe(201);
    expect((await readData<MemoDto>(withoutNotes)).notes).toBeNull();

    // A second request is what a browser refresh does: it reads the stored rows again.
    const reread = await readData<MemoDto[]>(
      await request('/api/customer-memos'),
    );
    expect(reread.map((memo) => memo.id)).toEqual(
      expect.arrayContaining([created.id]),
    );
  });

  it('searches by customer name with a partial, case-insensitive match', async () => {
    const partial = await readData<MemoDto[]>(
      await request('/api/customer-memos?search=%E6%98%9F%E6%B5%B7'),
    );
    expect(partial.map((memo) => memo.name)).toEqual(['星海科技']);

    await sendJson('/api/customer-memos', 'POST', { name: 'Acme Trading' });
    const latin = await readData<MemoDto[]>(
      await request('/api/customer-memos?search=acme'),
    );
    expect(latin.map((memo) => memo.name)).toEqual(['Acme Trading']);

    // Clearing the search restores the full list.
    const all = await readData<MemoDto[]>(await request('/api/customer-memos'));
    expect(all.length).toBeGreaterThan(latin.length);
  });

  it('reads one memo and reports an unknown id as 404', async () => {
    const created = await readData<MemoDto>(
      await sendJson('/api/customer-memos', 'POST', { name: '待查看' }),
    );

    const response = await request(`/api/customer-memos/${created.id}`);
    expect(response.status).toBe(200);
    expect((await readData<MemoDto>(response)).name).toBe('待查看');

    const missing = await request('/api/customer-memos/does-not-exist');
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      code: 'CUSTOMER_MEMO_NOT_FOUND',
    });
  });

  it('updates a memo and rejects an empty name on update', async () => {
    const created = await readData<MemoDto>(
      await sendJson('/api/customer-memos', 'POST', {
        name: '旧名称',
        notes: '旧备注',
      }),
    );

    const response = await sendJson(
      `/api/customer-memos/${created.id}`,
      'PATCH',
      { name: '新名称', notes: null },
    );
    expect(response.status).toBe(200);
    const updated = await readData<MemoDto>(response);
    expect(updated.name).toBe('新名称');
    expect(updated.notes).toBeNull();
    expect(updated.createdAt).toBe(created.createdAt);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.updatedAt).getTime(),
    );

    // The name is required on update too, so a blank one must not be stored.
    const blank = await sendJson(`/api/customer-memos/${created.id}`, 'PATCH', {
      name: '',
    });
    expect(blank.status).toBe(400);
    await expect(blank.json()).resolves.toMatchObject({
      code: 'CUSTOMER_MEMO_NAME_REQUIRED',
    });

    const missing = await sendJson(
      '/api/customer-memos/does-not-exist',
      'PATCH',
      { name: 'x' },
    );
    expect(missing.status).toBe(404);
  });

  it('deletes a memo and keeps it deleted after a fresh read', async () => {
    const created = await readData<MemoDto>(
      await sendJson('/api/customer-memos', 'POST', { name: '将被删除' }),
    );

    const removed = await request(`/api/customer-memos/${created.id}`, {
      method: 'DELETE',
    });
    expect(removed.status).toBe(204);

    expect((await request(`/api/customer-memos/${created.id}`)).status).toBe(
      404,
    );
    const remaining = await readData<MemoDto[]>(
      await request('/api/customer-memos'),
    );
    expect(remaining.map((memo) => memo.id)).not.toContain(created.id);

    // Deleting again reports the record is gone instead of failing unexpectedly.
    const again = await request(`/api/customer-memos/${created.id}`, {
      method: 'DELETE',
    });
    expect(again.status).toBe(404);
  });
});
