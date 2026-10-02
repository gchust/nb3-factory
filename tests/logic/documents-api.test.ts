// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.js';

/**
 * Documents API behavior the assistant and the pages rely on: the colleague
 * reads only the two granted documents, the supervisor reads all three, and an
 * unauthenticated request is refused. The scoping of the route middleware is
 * part of what is protected here — a catch-all would answer every unregistered
 * `/api/*` path, and a wildcard-free mount keeps those reaching the SPA.
 */
const tempDirs: string[] = [];
const servers: StandaloneServer[] = [];

interface TestServer {
  server: StandaloneServer;
  baseUrl: string;
}

function configFile(dir: string): string {
  const file = path.join(dir, 'config.yml');
  writeFileSync(
    file,
    [
      'app:',
      '  name: app-template-default',
      '  publicOrigin: http://localhost',
      'database:',
      '  default: main',
      '  connections:',
      '    main:',
      '      dialect: sqlite',
      `      database: ${path.join(dir, 'db.sqlite')}`,
      'logging:',
      '  level: error',
      '',
    ].join('\n'),
  );
  return file;
}

async function createDocumentsTestServer(): Promise<TestServer> {
  const dir = mkdtempSync(path.join(tmpdir(), 'nocobase-documents-api-'));
  tempDirs.push(dir);
  const clientDir = path.join(dir, 'client');
  mkdirSync(clientDir, { recursive: true });
  writeFileSync(path.join(clientDir, 'index.html'), '<main>test</main>');
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      AUTH_SECRET: 'documents-api-test-secret-at-least-32-chars',
      APP_CONFIG_FILE: configFile(dir),
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir,
      storageDir: dir,
    },
  });
  servers.push(server);
  return {
    server,
    baseUrl: `http://localhost${server.application.publicBasePath}`,
  };
}

async function signIn(
  test: TestServer,
  username: string,
  password: string,
): Promise<string> {
  const response = await test.server.fetch(
    new Request(`${test.baseUrl}/api/auth/sign-in/username`, {
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

async function listDocuments(
  test: TestServer,
  cookie: string,
): Promise<{ status: number; ids: string[] }> {
  const response = await test.server.fetch(
    new Request(`${test.baseUrl}/api/documentsMaterials:findMany`, {
      method: 'POST',
      headers: {
        cookie,
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ limit: 10 }),
    }),
  );
  if (response.status !== 200) {
    return { status: response.status, ids: [] };
  }
  const body = (await response.json()) as { data: { id: string }[] };
  return {
    status: response.status,
    ids: body.data.map((row) => row.id).sort(),
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('documents api', () => {
  it('returns the caller-scoped documents and refuses anonymous reads', async () => {
    const test = await createDocumentsTestServer();

    const anonymous = await listDocuments(test, '');
    expect(anonymous.status).toBe(401);

    const supervisor = await signIn(test, 'supervisor', 'Supervisor123!');
    await expect(listDocuments(test, supervisor)).resolves.toEqual({
      status: 200,
      ids: ['doc-a', 'doc-b', 'doc-c'],
    });

    const colleague = await signIn(test, 'colleague', 'Colleague123!');
    await expect(listDocuments(test, colleague)).resolves.toEqual({
      status: 200,
      ids: ['doc-a', 'doc-b'],
    });
  }, 120000);
});
