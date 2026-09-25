// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

/**
 * Business tests for the device inventory's permission model and its external
 * integration path. They run against a real standalone server backed by a
 * temporary SQLite database, so the migration and seed under test are the ones
 * a deployment runs, and every assertion is made through the same HTTP
 * endpoints a browser or an external caller would use.
 *
 * A01 reading the list answers the two seeded devices.
 * A02 a write by the integration account is refused and the data is unchanged.
 * A03 an API key bound to the integration account reads the list, and after it
 *     is revoked the same key is rejected.
 * R01 the key comes from the existing API Keys service; there is no second
 *     identity system.
 * R02 the Database Explorer reads the real `devices` table and its fields.
 */

const APPLICATION_ROOT = path.resolve(import.meta.dirname, '../..');

const INTEGRATION_USERNAME = 'device.integration';
const INTEGRATION_PASSWORD = 'device123';

const SCANNER_ID = 'device-scanner-a100';
const PRINTER_ID = 'device-printer-b200';

interface DeviceRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
}

let server: StandaloneServer;
let baseUrl: string;
let tempDir: string;
let adminCookie: string;
let integrationCookie: string;

beforeAll(async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'device-inventory-'));
  writeFileSync(
    path.join(tempDir, 'config.json'),
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(tempDir, 'database.sqlite'),
          },
        },
        migrations: { autoRun: true },
        seeds: { autoRun: true },
      },
      hub: { host: { enabled: false } },
    }),
  );

  server = await createStandaloneServer({
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_CONFIG_FILE: path.join(tempDir, 'config.json'),
      // A public origin gives Better Auth a base URL, which is what the CSRF
      // origin check trusts for the cookie-authenticated writes below.
      APP_PUBLIC_ORIGIN: 'http://localhost',
    },
    paths: {
      rootDir: APPLICATION_ROOT,
      serverDir: path.join(APPLICATION_ROOT, 'server'),
      databaseDir: path.join(APPLICATION_ROOT, 'database'),
      clientDir: path.join(APPLICATION_ROOT, 'dist/client'),
      storageDir: tempDir,
    },
    viteDevUrl: false,
  });
  baseUrl = `http://localhost${server.application.publicBasePath}`;

  adminCookie = await signIn('nocobase', 'admin123');
  integrationCookie = await signIn(INTEGRATION_USERNAME, INTEGRATION_PASSWORD);
});

afterAll(async () => {
  await server?.close();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

async function signIn(username: string, password: string): Promise<string> {
  const response = await server.fetch(
    new Request(`${baseUrl}/api/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

function request(pathname: string, init: RequestInit = {}) {
  return server.fetch(new Request(`${baseUrl}${pathname}`, init));
}

function withCookie(cookie: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      cookie,
      // State-changing requests pass the host's CSRF origin check, exactly as
      // the browser client does.
      origin: 'http://localhost',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  };
}

async function listDevices(cookie: string): Promise<{
  status: number;
  ids: string[];
  canCreate: boolean;
  rows: DeviceRow[];
}> {
  const response = await request('/api/devices', withCookie(cookie));
  if (response.status !== 200) {
    return { status: response.status, ids: [], canCreate: false, rows: [] };
  }
  const body = (await response.json()) as {
    data: DeviceRow[];
    meta?: { canCreate?: boolean };
  };
  return {
    status: response.status,
    ids: body.data.map((row) => row.id).sort(),
    canCreate: body.meta?.canCreate === true,
    rows: body.data,
  };
}

describe('device inventory permissions', () => {
  it('rejects an anonymous read', async () => {
    const response = await request('/api/devices');
    expect(response.status).toBe(401);
  });

  it('A01 shows the administrator and the integration account the two seeded devices', async () => {
    for (const cookie of [adminCookie, integrationCookie]) {
      const { status, ids, rows } = await listDevices(cookie);
      expect(status).toBe(200);
      expect(ids).toEqual([PRINTER_ID, SCANNER_ID]);
      expect(rows).toHaveLength(2);
      // The only business fields are the number and the name.
      expect(rows.map((row) => row.code).sort()).toEqual([
        'DEV-0001',
        'DEV-0002',
      ]);
      expect(rows.every((row) => typeof row.name === 'string')).toBe(true);
    }
  });

  it('shows the administrator write capability and the integration account none', async () => {
    const admin = await listDevices(adminCookie);
    expect(admin.canCreate).toBe(true);
    expect(admin.rows.every((row) => row.canEdit && row.canDelete)).toBe(true);

    const integration = await listDevices(integrationCookie);
    // The integration account is read-only: it cannot create, and every row
    // reports the same denial its action endpoints enforce.
    expect(integration.canCreate).toBe(false);
    expect(
      integration.rows.every((row) => !row.canEdit && !row.canDelete),
    ).toBe(true);
  });

  it('A02 refuses every integration write and leaves the data unchanged', async () => {
    const create = await request(
      '/api/devices',
      withCookie(integrationCookie, {
        method: 'POST',
        body: JSON.stringify({ code: 'DEV-9999', name: 'Integration attempt' }),
      }),
    );
    expect(create.status).toBe(403);

    const update = await request(
      `/api/devices/${SCANNER_ID}`,
      withCookie(integrationCookie, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Integration attempt' }),
      }),
    );
    expect(update.status).toBe(403);

    const remove = await request(
      `/api/devices/${SCANNER_ID}`,
      withCookie(integrationCookie, { method: 'DELETE' }),
    );
    expect(remove.status).toBe(403);

    // The refusals happened before the Repository was used, so the seeded list
    // is exactly as it was.
    const { ids, rows } = await listDevices(integrationCookie);
    expect(ids).toEqual([PRINTER_ID, SCANNER_ID]);
    expect(rows.find((row) => row.id === SCANNER_ID)?.name).toBe(
      '无线条码扫描枪',
    );
  });

  it('lets the administrator maintain devices', async () => {
    const created = await request(
      '/api/devices',
      withCookie(adminCookie, {
        method: 'POST',
        body: JSON.stringify({ code: 'DEV-0003', name: '备用设备' }),
      }),
    );
    expect(created.status).toBe(201);
    const record = (await created.json()) as { data: { id: string } };

    const updated = await request(
      `/api/devices/${record.data.id}`,
      withCookie(adminCookie, {
        method: 'PATCH',
        body: JSON.stringify({ name: '备用设备（已更新）' }),
      }),
    );
    expect(updated.status).toBe(200);

    const removed = await request(
      `/api/devices/${record.data.id}`,
      withCookie(adminCookie, { method: 'DELETE' }),
    );
    expect(removed.status).toBe(200);

    const { ids } = await listDevices(adminCookie);
    expect(ids).toEqual([PRINTER_ID, SCANNER_ID]);
  });

  it('R01/A03 reads with a user-bound key and rejects it after revocation', async () => {
    // The key is issued through the existing API Keys service, acting on the
    // integration account's own session.
    const created = await request(
      '/api/auth/api-key/create',
      withCookie(integrationCookie, {
        method: 'POST',
        body: JSON.stringify({ name: 'device-integration-test' }),
      }),
    );
    expect(created.status).toBe(200);
    const issued = (await created.json()) as { id: string; key: string };
    expect(typeof issued.key).toBe('string');
    expect(issued.key.length).toBeGreaterThan(0);
    expect(issued.id).toBeTruthy();

    const list = await request('/api/devices', {
      headers: { 'x-api-key': issued.key },
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { data: DeviceRow[] };
    expect(body.data.map((row) => row.id).sort()).toEqual([
      PRINTER_ID,
      SCANNER_ID,
    ]);

    // The same key carries the account's permissions, so a write is refused.
    const write = await request('/api/devices', {
      method: 'POST',
      headers: {
        'x-api-key': issued.key,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ code: 'DEV-7777', name: 'Key attempt' }),
    });
    expect(write.status).toBe(403);

    // Revoking the key through the same service is what the page does; the
    // same key must stop authenticating.
    const revoked = await request(
      '/api/auth/api-key/delete',
      withCookie(integrationCookie, {
        method: 'POST',
        body: JSON.stringify({ keyId: issued.id }),
      }),
    );
    expect(revoked.status).toBe(200);

    const after = await request('/api/devices', {
      headers: { 'x-api-key': issued.key },
    });
    expect(after.status).toBe(401);
  });

  it('R02 reads the real devices table and fields through Database Explorer for the administrator only', async () => {
    const forbidden = await request(
      '/api/database-explorer/connections/main/collections',
      withCookie(integrationCookie),
    );
    expect(forbidden.status).toBe(403);

    const collections = await request(
      '/api/database-explorer/connections/main/collections',
      withCookie(adminCookie),
    );
    expect(collections.status).toBe(200);
    const list = (await collections.json()) as {
      data: { items: { name: string }[] };
    };
    expect(list.data.items.map((item) => item.name)).toContain('devices');

    const detail = await request(
      '/api/database-explorer/connections/main/collections/devices',
      withCookie(adminCookie),
    );
    expect(detail.status).toBe(200);
    const serialized = JSON.stringify(await detail.json());
    expect(serialized).toContain('"code"');
    expect(serialized).toContain('"name"');
  });
});
