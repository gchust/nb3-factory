// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const servers: StandaloneServer[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function requestApp(
  app: StandaloneServer,
  input: string,
  requestInit?: RequestInit,
): Promise<Response> {
  return Promise.resolve(app.fetch(new Request(input, requestInit)));
}

/**
 * A standalone server on a throwaway sqlite database, with the application's
 * migrations and seeds run at startup. `createStandaloneServer` resolves the
 * application's own `server/runtime.ts`, so the contacts migration, seed,
 * provider and routes under test are the ones the application ships.
 */
async function createTestServer(): Promise<StandaloneServer> {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const databaseDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-contacts-database-'),
  );
  tempDirs.push(databaseDir);
  const configFile = path.join(databaseDir, 'config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(databaseDir, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      },
      hub: { host: { enabled: false } },
    }),
  );

  const server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_CONFIG_FILE: configFile,
      // Cookie-authenticated writes are checked against the app's public
      // origin; without it Better Auth has no trusted origin to compare with.
      APP_PUBLIC_ORIGIN: 'http://localhost',
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: path.join(sourceRoot, 'storage'),
    },
  });
  servers.push(server);
  return server;
}

interface ContactRecord {
  readonly id: number;
  readonly name: string;
  readonly department: string;
  readonly phone: string | null;
  readonly notes: string | null;
}

async function signIn(app: StandaloneServer, baseUrl: string): Promise<string> {
  const response = await requestApp(
    app,
    `${baseUrl}/api/auth/sign-in/username`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
    },
  );
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

describe('contacts API', () => {
  it('lists, filters, searches, creates, updates and deletes contacts over an authenticated session', async () => {
    const app = await createTestServer();
    const baseUrl = `http://localhost${app.application.publicBasePath}`;
    // Cookie-authenticated writes need a trusted Origin; the origin carries no path.
    const origin = new URL(baseUrl).origin;

    // The address book is a signed-in page; its endpoint enforces that itself.
    const anonymous = await requestApp(app, `${baseUrl}/api/contacts`);
    expect(anonymous.status).toBe(401);

    const cookie = await signIn(app, baseUrl);
    const authHeaders = { cookie };

    // The seed ran at startup: five contacts over all three departments, no duplicates.
    const list = await requestApp(app, `${baseUrl}/api/contacts`, {
      headers: authHeaders,
    });
    expect(list.status).toBe(200);
    const seeded = (await list.json()) as { data: ContactRecord[] };
    expect(seeded.data).toHaveLength(5);
    expect(new Set(seeded.data.map((contact) => contact.department))).toEqual(
      new Set(['rd', 'sales', 'admin']),
    );
    // The service sorts by name ascending; the stored order is the sorted one.
    expect(seeded.data.map((contact) => contact.name)).toEqual(
      [...seeded.data.map((contact) => contact.name)].sort(),
    );

    const rd = await requestApp(app, `${baseUrl}/api/contacts?department=rd`, {
      headers: authHeaders,
    });
    const byDepartment = (await rd.json()) as { data: ContactRecord[] };
    expect(byDepartment.data).toHaveLength(2);
    expect(
      byDepartment.data.every((contact) => contact.department === 'rd'),
    ).toBe(true);

    const invalidDepartment = await requestApp(
      app,
      `${baseUrl}/api/contacts?department=unknown`,
      { headers: authHeaders },
    );
    expect(invalidDepartment.status).toBe(400);
    await expect(invalidDepartment.json()).resolves.toMatchObject({
      code: 'CONTACT_DEPARTMENT_INVALID',
    });

    const search = await requestApp(
      app,
      `${baseUrl}/api/contacts?search=${encodeURIComponent('陈')}`,
      { headers: authHeaders },
    );
    const searched = (await search.json()) as { data: ContactRecord[] };
    expect(searched.data).toHaveLength(1);
    expect(searched.data[0]?.name).toBe('陈晨');

    // The edit dialog loads a single record by id.
    const single = await requestApp(app, `${baseUrl}/api/contacts/1`, {
      headers: authHeaders,
    });
    expect(single.status).toBe(200);
    await expect(single.json()).resolves.toMatchObject({
      data: { id: 1, name: '陈晨', department: 'rd' },
    });
    const missing = await requestApp(app, `${baseUrl}/api/contacts/999999`, {
      headers: authHeaders,
    });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      code: 'CONTACT_NOT_FOUND',
    });

    const created = await requestApp(app, `${baseUrl}/api/contacts`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
        origin,
      },
      body: JSON.stringify({
        name: '赵磊',
        department: 'admin',
        phone: '13800138009',
        notes: '前台',
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { data: ContactRecord };
    expect(createdBody.data).toMatchObject({
      name: '赵磊',
      department: 'admin',
      phone: '13800138009',
    });

    const invalidPhone = await requestApp(app, `${baseUrl}/api/contacts`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
        origin,
      },
      body: JSON.stringify({
        name: '钱进',
        department: 'sales',
        phone: '12345',
      }),
    });
    expect(invalidPhone.status).toBe(400);
    await expect(invalidPhone.json()).resolves.toMatchObject({
      code: 'CONTACT_PHONE_INVALID',
    });

    const missingName = await requestApp(app, `${baseUrl}/api/contacts`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
        origin,
      },
      body: JSON.stringify({ name: '   ', department: 'sales' }),
    });
    expect(missingName.status).toBe(400);
    await expect(missingName.json()).resolves.toMatchObject({
      code: 'CONTACT_NAME_REQUIRED',
    });

    const patched = await requestApp(
      app,
      `${baseUrl}/api/contacts/${createdBody.data.id}`,
      {
        method: 'PATCH',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
          origin,
        },
        body: JSON.stringify({
          name: '赵磊',
          department: 'sales',
          phone: null,
          notes: null,
        }),
      },
    );
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as { data: ContactRecord };
    expect(patchedBody.data).toMatchObject({
      department: 'sales',
      phone: null,
      notes: null,
    });

    const missingPatch = await requestApp(
      app,
      `${baseUrl}/api/contacts/999999`,
      {
        method: 'PATCH',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
          origin,
        },
        body: JSON.stringify({ name: 'Ghost', department: 'rd' }),
      },
    );
    expect(missingPatch.status).toBe(404);
    await expect(missingPatch.json()).resolves.toMatchObject({
      code: 'CONTACT_NOT_FOUND',
    });

    const removed = await requestApp(
      app,
      `${baseUrl}/api/contacts/${createdBody.data.id}`,
      { method: 'DELETE', headers: { ...authHeaders, origin } },
    );
    expect(removed.status).toBe(204);

    const removedAgain = await requestApp(
      app,
      `${baseUrl}/api/contacts/${createdBody.data.id}`,
      { method: 'DELETE', headers: { ...authHeaders, origin } },
    );
    expect(removedAgain.status).toBe(404);

    const afterDelete = await requestApp(app, `${baseUrl}/api/contacts`, {
      headers: authHeaders,
    });
    const remaining = (await afterDelete.json()) as { data: ContactRecord[] };
    expect(remaining.data).toHaveLength(5);
  }, 120_000);
});
