// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const sourceRoot = path.resolve(import.meta.dirname, '../..');

interface Device {
  readonly id: number;
  readonly code: string;
  readonly name: string;
}

const tempDirs: string[] = [];
let server: StandaloneServer | undefined;
let baseUrl = '';

function app(): StandaloneServer {
  if (!server) throw new Error('The application server has not started.');
  return server;
}

const ORIGIN = 'http://localhost';

async function request(
  pathname: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  // A cookie-authenticated write is refused without a trusted Origin, the same guard a browser sends.
  if (!headers.has('origin')) headers.set('origin', ORIGIN);
  return await app().fetch(
    new Request(`${baseUrl}${pathname}`, { ...init, headers }),
  );
}

function jsonRequest(
  pathname: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return request(pathname, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function signIn(username: string, password: string): Promise<string> {
  const response = await jsonRequest('/api/auth/sign-in/username', 'POST', {
    username,
    password,
  });
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

async function listDevices(cookie: string): Promise<Device[]> {
  const response = await request('/api/devices', { headers: { cookie } });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: Device[] };
  return body.data;
}

function requireDevice(devices: readonly Device[], code: string): Device {
  const device = devices.find((candidate) => candidate.code === code);
  if (!device) throw new Error(`Device ${code} is missing.`);
  return device;
}

beforeAll(async () => {
  server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_PUBLIC_ORIGIN: ORIGIN,
      APP_CONFIG_FILE: writeRuntimeTestConfig(),
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: path.join(sourceRoot, 'storage'),
    },
  });
  baseUrl = `http://localhost${app().application.publicBasePath}`;
}, 180_000);

afterAll(async () => {
  await server?.close();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('device list', () => {
  it('rejects an unauthenticated read', async () => {
    const response = await request('/api/devices');
    expect(response.status).toBe(401);
  });

  it('lets an administrator read, create, edit and delete devices', async () => {
    const cookie = await signIn('nocobase', 'admin123');

    const seeded = await listDevices(cookie);
    expect(seeded).toHaveLength(2);
    expect(seeded.map((device) => device.code).sort()).toEqual([
      'DEV-001',
      'DEV-002',
    ]);

    const createdResponse = await jsonRequest(
      '/api/devices',
      'POST',
      { code: 'DEV-900', name: 'Flow meter' },
      { cookie },
    );
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as { data: Device };
    expect(created.data).toMatchObject({
      code: 'DEV-900',
      name: 'Flow meter',
    });

    const updatedResponse = await jsonRequest(
      `/api/devices/${created.data.id}`,
      'PUT',
      { code: 'DEV-900', name: 'Coriolis flow meter' },
      { cookie },
    );
    expect(updatedResponse.status).toBe(200);
    await expect(updatedResponse.json()).resolves.toMatchObject({
      data: { id: created.data.id, name: 'Coriolis flow meter' },
    });

    const duplicate = await jsonRequest(
      '/api/devices',
      'POST',
      { code: 'DEV-001', name: 'Temperature sensor' },
      { cookie },
    );
    expect(duplicate.status).toBe(409);

    const invalid = await jsonRequest(
      '/api/devices',
      'POST',
      { code: '', name: '' },
      { cookie },
    );
    expect(invalid.status).toBe(400);

    const removed = await request(`/api/devices/${created.data.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(removed.status).toBe(200);
    const after = await listDevices(cookie);
    expect(after.map((device) => device.code)).not.toContain('DEV-900');
  });

  it('gives the integration account read-only access and no structure viewer', async () => {
    const cookie = await signIn('integration', 'Integration123!');

    const devices = await listDevices(cookie);
    const target = requireDevice(devices, 'DEV-001');

    const created = await jsonRequest(
      '/api/devices',
      'POST',
      { code: 'DEV-901', name: 'Not allowed' },
      { cookie },
    );
    expect(created.status).toBe(403);

    const updated = await jsonRequest(
      `/api/devices/${target.id}`,
      'PUT',
      { code: 'DEV-001', name: 'Not allowed' },
      { cookie },
    );
    expect(updated.status).toBe(403);

    const removed = await request(`/api/devices/${target.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(removed.status).toBe(403);

    const explorer = await request('/api/database-explorer/connections', {
      headers: { cookie },
    });
    expect(explorer.status).toBe(403);

    const structure = await request(
      '/api/database-explorer/connections/main/collections/devices',
      { headers: { cookie } },
    );
    expect(structure.status).toBe(403);
  });

  it('shows the device table to an authorized administrator in the structure viewer', async () => {
    const cookie = await signIn('nocobase', 'admin123');
    const response = await request('/api/database-explorer/connections', {
      headers: { cookie },
    });
    expect(response.status).toBe(200);

    const detail = await request(
      '/api/database-explorer/connections/main/collections/devices',
      { headers: { cookie } },
    );
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as {
      data: {
        collection: {
          name: string;
          collection: { fields?: { name?: string }[] };
        };
      };
    };
    expect(body.data.collection.name).toBe('devices');
    const fieldNames = (body.data.collection.collection.fields ?? []).map(
      (field) => field.name,
    );
    expect(fieldNames).toEqual(expect.arrayContaining(['code', 'name']));
  });

  it('reads with an integration API key and rejects it after revocation', async () => {
    const cookie = await signIn('integration', 'Integration123!');

    const createdResponse = await jsonRequest(
      '/api/auth/api-key/create',
      'POST',
      { name: 'device-reader' },
      { cookie },
    );
    expect(createdResponse.status).toBe(200);
    const key = (await createdResponse.json()) as { id: string; key: string };
    expect(key.key).toBeTruthy();

    const read = await request('/api/devices', {
      headers: { 'x-api-key': key.key },
    });
    expect(read.status).toBe(200);
    const body = (await read.json()) as { data: Device[] };
    expect(body.data.map((device) => device.code).sort()).toEqual([
      'DEV-001',
      'DEV-002',
    ]);

    const write = await jsonRequest(
      '/api/devices',
      'POST',
      { code: 'DEV-902', name: 'Not allowed' },
      { 'x-api-key': key.key },
    );
    expect(write.status).toBe(403);

    const revoked = await jsonRequest(
      '/api/auth/api-key/delete',
      'POST',
      { keyId: key.id },
      { cookie },
    );
    expect(revoked.status).toBe(200);

    const rejected = await request('/api/devices', {
      headers: { 'x-api-key': key.key },
    });
    expect(rejected.status).toBe(401);
  });
});

function writeRuntimeTestConfig(): string {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'nocobase-devices-database-'),
  );
  tempDirs.push(directory);
  const file = path.join(directory, 'config.json');
  writeFileSync(
    file,
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(directory, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      },
      hub: { host: { enabled: false } },
    }),
  );
  return file;
}
