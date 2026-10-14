// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createTestAppConfig,
  type TestAppConfig,
} from '@nocobase/app-testing/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

// A standalone application on a throwaway SQLite database, installed with
// sample data, so the tests talk to the real HTTP surface: authentication,
// validation, the service and the unique index.
let app: StandaloneServer;
let baseUrl: string;
let cookie: string;
const testConfigs: TestAppConfig[] = [];
const tempDirs: string[] = [];

beforeAll(async () => {
  const databaseDirectory = mkdtempSync(
    path.join(tmpdir(), 'devices-api-database-'),
  );
  tempDirs.push(databaseDirectory);
  const config = await createTestAppConfig({
    connections: ['main'],
    install: true,
    config: {
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      users: {
        initialAdmin: {
          username: 'nocobase',
          email: 'admin@nocobase.com',
          password: 'admin123',
        },
      },
      jobs: {
        default: 'memory',
        memory: {
          adapter: 'memory',
          persistence: { path: path.join(databaseDirectory, 'jobs') },
        },
      },
      queue: {
        default: 'memory',
        memory: {
          adapter: 'inMemory',
          persistence: { path: path.join(databaseDirectory, 'queue') },
        },
      },
    },
  });
  testConfigs.push(config);

  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  app = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_SAMPLE_DATA: 'true',
      APP_PUBLIC_ORIGIN: 'http://localhost',
      APP_CONFIG_FILE: config.path,
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: path.join(sourceRoot, 'storage'),
    },
  });

  baseUrl = `http://localhost${app.application.publicBasePath}`;
  const signIn = await request(`${baseUrl}/api/auth/sign-in/username`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
  });
  if (signIn.status !== 200) {
    throw new Error(
      `Sign-in failed with ${signIn.status}: ${await signIn.text()}`,
    );
  }
  cookie = signIn.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
});

afterAll(async () => {
  await app?.close();
  await Promise.all(testConfigs.splice(0).map((config) => config.dispose()));
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('devices API', () => {
  it('answers 401 to an unauthenticated request', async () => {
    const response = await request(`${baseUrl}/api/devices`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { status: 'UNAUTHENTICATED' },
    });
  });

  it('lists the seeded devices and filters them by status', async () => {
    const all = await request(`${baseUrl}/api/devices`, { cookie });
    expect(all.status).toBe(200);
    const list = (await all.json()) as {
      data: { id: string; code: string; name: string; status: string }[];
      meta: { total: number };
    };
    expect(list.meta.total).toBeGreaterThanOrEqual(2);
    // User-entered names are returned unchanged, not translated.
    expect(list.data.map((device) => device.code)).toEqual(
      expect.arrayContaining(['DEV-001', 'DEV-002']),
    );
    expect(list.data.find((device) => device.code === 'DEV-001')?.name).toBe(
      '会议室投影仪',
    );
    expect(typeof list.data[0].id).toBe('string');

    const borrowed = await request(`${baseUrl}/api/devices?status=borrowed`, {
      cookie,
    });
    expect(borrowed.status).toBe(200);
    const borrowedList = (await borrowed.json()) as {
      data: { code: string; status: string }[];
    };
    expect(borrowedList.data).toHaveLength(1);
    expect(borrowedList.data[0]).toMatchObject({
      code: 'DEV-002',
      status: 'borrowed',
    });
  });

  it('creates a device, then refuses a code that is already taken', async () => {
    const created = await request(`${baseUrl}/api/devices`, {
      method: 'POST',
      cookie,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: 'DEV-900',
        name: '测试设备',
        status: 'available',
      }),
    });
    expect(created.status).toBe(201);
    const device = (await created.json()) as { data: { id: string } };
    expect(device.data.id).toBeTruthy();

    const duplicate = await request(`${baseUrl}/api/devices`, {
      method: 'POST',
      cookie,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: 'DEV-900',
        name: '另一台',
        status: 'available',
      }),
    });
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: {
        status: 'ALREADY_EXISTS',
        reason: 'DEVICE_CODE_TAKEN',
        domain: 'devices',
        fieldViolations: [{ field: 'code' }],
      },
    });

    const fetched = await request(`${baseUrl}/api/devices/${device.data.id}`, {
      cookie,
    });
    expect(fetched.status).toBe(200);
    await expect(fetched.json()).resolves.toMatchObject({
      data: { code: 'DEV-900', name: '测试设备', status: 'available' },
    });

    const updated = await request(`${baseUrl}/api/devices/${device.data.id}`, {
      method: 'PATCH',
      cookie,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'borrowed' }),
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      data: { status: 'borrowed' },
    });
  });

  it('names the missing field on an invalid create', async () => {
    const response = await request(`${baseUrl}/api/devices`, {
      method: 'POST',
      cookie,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'DEV-901', status: 'available' }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        status: 'INVALID_ARGUMENT',
        reason: 'INVALID_INPUT',
        fieldViolations: [expect.objectContaining({ field: 'name' })],
      },
    });
  });

  it('answers 404 for a device that does not exist', async () => {
    const response = await request(`${baseUrl}/api/devices/999999`, { cookie });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        status: 'NOT_FOUND',
        reason: 'DEVICE_NOT_FOUND',
        domain: 'devices',
      },
    });
  });
});

function request(
  input: string,
  options: { cookie?: string } & RequestInit = {},
): Response | Promise<Response> {
  const { cookie: session, ...init } = options;
  return app.fetch(
    new Request(input, {
      ...init,
      headers: {
        // A cookie-authenticated write is refused unless its origin is trusted;
        // `APP_PUBLIC_ORIGIN` makes this the application's own origin.
        origin: 'http://localhost',
        ...(init.headers as Record<string, string> | undefined),
        ...(session ? { cookie: session } : {}),
      },
    }),
  );
}
