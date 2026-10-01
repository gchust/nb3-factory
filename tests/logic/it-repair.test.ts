// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.js';
import {
  DEMO_PASSWORD,
  DEMO_TICKETS,
} from '../../database/seed-data/it-repair-demo.js';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

interface RepairTicketDto {
  id: number;
  title: string;
  category: string;
  status: string;
  resolution: string | null;
  submittedById: string;
  submittedByName: string;
  handlerId: string | null;
  handlerName: string | null;
  createdAt: string;
  canStart: boolean;
  canComplete: boolean;
}

interface TicketListDto {
  data: RepairTicketDto[];
  capabilities: { create: boolean; process: boolean };
}

const servers: StandaloneServer[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('IT repair workflow', () => {
  it('shows every persona only the tickets they may see', async () => {
    const server = await startApp();

    const handler = await signIn(server, 'handler.zhao');
    const handlerList = await list(server, handler);
    expect(handlerList.capabilities).toEqual({ create: true, process: true });
    expect(handlerList.data).toHaveLength(DEMO_TICKETS.length);

    const li = await signIn(server, 'employee.li');
    const liList = await list(server, li);
    expect(liList.capabilities).toEqual({ create: true, process: false });
    expect(liList.data.map((ticket) => ticket.title).sort()).toEqual(
      ['Broken office chair', 'Laptop will not power on'].sort(),
    );

    const wang = await signIn(server, 'employee.wang');
    const wangList = await list(server, wang);
    expect(wangList.data.map((ticket) => ticket.title)).toEqual([
      'Cannot sign in to email',
    ]);
  });

  it('rejects anonymous access to the tickets API', async () => {
    const server = await startApp();

    const response = await request(server, '/api/it-repair/tickets');
    expect(response.status).toBe(401);

    const created = await request(server, '/api/it-repair/tickets', undefined, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Anonymous', category: 'other' }),
    });
    expect(created.status).toBe(401);
  });

  it('lets an employee submit a request and filter the list by status', async () => {
    const server = await startApp();
    const li = await signIn(server, 'employee.li');

    const created = await request(server, '/api/it-repair/tickets', li, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Monitor flickers',
        category: 'computer',
        description:
          'The external monitor flickers when the dock is connected.',
      }),
    });
    expect(created.status).toBe(201);
    const ticket = (await created.json()) as { data: RepairTicketDto };
    expect(ticket.data).toMatchObject({
      title: 'Monitor flickers',
      category: 'computer',
      status: 'pending',
      resolution: null,
      handlerId: null,
      canStart: false,
      canComplete: false,
    });
    expect(ticket.data.submittedByName).toBe('Li Ming');

    const pending = await list(server, li, 'pending');
    expect(pending.data.map((row) => row.title).sort()).toEqual(
      ['Laptop will not power on', 'Monitor flickers'].sort(),
    );

    const invalidTitle = await request(server, '/api/it-repair/tickets', li, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ', category: 'computer' }),
    });
    expect(invalidTitle.status).toBe(400);

    const invalidCategory = await request(
      server,
      '/api/it-repair/tickets',
      li,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Bad category', category: 'printer' }),
      },
    );
    expect(invalidCategory.status).toBe(400);
  });

  it('keeps an employee from reading or advancing another employee ticket', async () => {
    const server = await startApp();
    const li = await signIn(server, 'employee.li');
    const wang = await signIn(server, 'employee.wang');

    const wangTickets = await list(server, wang);
    const foreign = wangTickets.data[0];
    expect(foreign).toBeDefined();

    // A direct link must not disclose the record's content.
    const direct = await request(
      server,
      `/api/it-repair/tickets/${foreign.id}`,
      li,
    );
    expect(direct.status).toBe(404);

    const start = await request(
      server,
      `/api/it-repair/tickets/${foreign.id}/start`,
      li,
      { method: 'POST' },
    );
    expect(start.status).toBe(403);

    const complete = await request(
      server,
      `/api/it-repair/tickets/${foreign.id}/complete`,
      li,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolution: 'Trying to hijack' }),
      },
    );
    expect(complete.status).toBe(403);
  });

  it('advances a pending ticket from start to completed with a resolution note', async () => {
    const server = await startApp();
    const handler = await signIn(server, 'handler.zhao');
    const listBefore = await list(server, handler);
    const pending = listBefore.data.find(
      (ticket) => ticket.title === 'Laptop will not power on',
    );
    expect(pending).toBeDefined();
    if (!pending) return;
    expect(pending.canStart).toBe(true);
    expect(pending.canComplete).toBe(false);

    const started = await request(
      server,
      `/api/it-repair/tickets/${pending.id}/start`,
      handler,
      { method: 'POST' },
    );
    expect(started.status).toBe(200);
    const processing = (await started.json()) as { data: RepairTicketDto };
    expect(processing.data).toMatchObject({
      status: 'processing',
      handlerName: 'Zhao Lei',
      canStart: false,
      canComplete: true,
    });
    expect(processing.data.handlerId).not.toBeNull();

    const startedAgain = await request(
      server,
      `/api/it-repair/tickets/${pending.id}/start`,
      handler,
      { method: 'POST' },
    );
    expect(startedAgain.status).toBe(409);

    const noteRequired = await request(
      server,
      `/api/it-repair/tickets/${pending.id}/complete`,
      handler,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolution: '  ' }),
      },
    );
    expect(noteRequired.status).toBe(400);

    const missingNote = await request(
      server,
      `/api/it-repair/tickets/${pending.id}/complete`,
      handler,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    expect(missingNote.status).toBe(400);

    const completed = await request(
      server,
      `/api/it-repair/tickets/${pending.id}/complete`,
      handler,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolution: 'Replaced the power supply.' }),
      },
    );
    expect(completed.status).toBe(200);
    const done = (await completed.json()) as { data: RepairTicketDto };
    expect(done.data).toMatchObject({
      status: 'completed',
      resolution: 'Replaced the power supply.',
      canStart: false,
      canComplete: false,
    });
  });

  it('keeps a completed ticket immutable', async () => {
    const server = await startApp();
    const handler = await signIn(server, 'handler.zhao');
    const rows = await list(server, handler);
    const completed = rows.data.find(
      (ticket) => ticket.title === 'Broken office chair',
    );
    expect(completed?.status).toBe('completed');
    if (!completed) return;
    expect(completed.canStart).toBe(false);
    expect(completed.canComplete).toBe(false);

    const start = await request(
      server,
      `/api/it-repair/tickets/${completed.id}/start`,
      handler,
      { method: 'POST' },
    );
    expect(start.status).toBe(409);

    const complete = await request(
      server,
      `/api/it-repair/tickets/${completed.id}/complete`,
      handler,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resolution: 'Attempt to change a finished ticket',
        }),
      },
    );
    expect(complete.status).toBe(409);
  });
});

async function startApp(): Promise<StandaloneServer> {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const databaseDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-it-repair-database-'),
  );
  tempDirs.push(databaseDir);

  const server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      // Browsers reach the app at this origin, and the authentication write
      // protection trusts it. Without it, a cookie-backed write is refused.
      APP_PUBLIC_ORIGIN: 'http://localhost',
      APP_CONFIG_FILE: writeTestConfig(databaseDir),
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

function writeTestConfig(directory: string): string {
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

function baseUrl(server: StandaloneServer): string {
  return `http://localhost${server.application.publicBasePath}`;
}

function request(
  server: StandaloneServer,
  pathname: string,
  cookie?: string,
  init?: RequestInit,
): Promise<Response> {
  return server.fetch(
    new Request(`${baseUrl(server)}${pathname}`, {
      ...init,
      headers: {
        // A browser sends Origin on a same-origin write; the authentication
        // write protection refuses a cookie-backed request without one.
        origin: baseUrl(server),
        ...(cookie ? { cookie } : {}),
        ...(init?.headers ?? {}),
      },
    }),
  );
}

async function signIn(
  server: StandaloneServer,
  username: string,
): Promise<string> {
  const response = await request(
    server,
    '/api/auth/sign-in/username',
    undefined,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: DEMO_PASSWORD }),
    },
  );
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  expect(cookie.length).toBeGreaterThan(0);
  return cookie;
}

async function list(
  server: StandaloneServer,
  cookie: string,
  status?: string,
): Promise<TicketListDto> {
  const query = status ? `?status=${status}` : '';
  const response = await request(
    server,
    `/api/it-repair/tickets${query}`,
    cookie,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as TicketListDto;
}
