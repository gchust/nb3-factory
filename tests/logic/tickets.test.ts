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
 * End-to-end coverage for the repair-ticket API.
 *
 * This runs the real application against a throwaway SQLite database: every
 * migration, the permission-set and demo-data seeds, the authorization plugin
 * and the route all execute as they do in production. That matters because the
 * feature's core promise — an employee sees only their own tickets, a handler
 * sees every ticket, and only a handler may start or complete one — is decided
 * by the persisted permission sets and the record scope, none of which a mocked
 * unit test would exercise.
 */
interface TicketDto {
  id: string;
  title: string;
  category: string;
  status: string;
  resolution: string | null;
  submitterId: string;
  handlerId: string | null;
}

interface TicketListResponse {
  data: TicketDto[];
}

interface TicketResponse {
  data: TicketDto;
}

const DEMO_PASSWORD = 'demo1234';

let server: StandaloneServer;
let databaseDir: string;
let clientDir: string;
let baseUrl: string;
let employeeCookie: string;
let otherEmployeeCookie: string;
let handlerCookie: string;

beforeAll(async () => {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  databaseDir = mkdtempSync(path.join(tmpdir(), 'nocobase-tickets-test-'));
  clientDir = mkdtempSync(path.join(tmpdir(), 'nocobase-tickets-client-'));
  writeFileSync(
    path.join(clientDir, 'index.html'),
    '<main>Tickets API test</main>',
  );
  const configFile = path.join(databaseDir, 'config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      app: { publicOrigin: 'http://localhost' },
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

  server = await createStandaloneServer({
    viteDevUrl: false,
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
      APP_CONFIG_FILE: configFile,
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir,
      storageDir: path.join(sourceRoot, 'storage'),
    },
  });
  baseUrl = `http://localhost${server.application.publicBasePath}`;
  employeeCookie = await signIn('li.wei');
  otherEmployeeCookie = await signIn('wang.fang');
  handlerCookie = await signIn('chen.hao');
}, 180_000);

afterAll(async () => {
  await server?.close();
  if (databaseDir) {
    rmSync(databaseDir, { recursive: true, force: true });
  }
  if (clientDir) {
    rmSync(clientDir, { recursive: true, force: true });
  }
});

describe('repair tickets route', () => {
  it('rejects anonymous requests', async () => {
    const response = await fetchJson('/api/tickets');
    expect(response.status).toBe(401);
  });

  it('shows an employee only the tickets they submitted', async () => {
    const response = await fetchJson('/api/tickets', {
      cookie: employeeCookie,
    });
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as TicketListResponse;
    expect(data).toHaveLength(2);
    expect(new Set(data.map((ticket) => ticket.submitterId)).size).toBe(1);
    expect(data.map((ticket) => ticket.title)).not.toContain(
      '邮箱账号无法登录',
    );
  });

  it('filters the list by status on the server', async () => {
    const completed = await fetchJson('/api/tickets?status=completed', {
      cookie: employeeCookie,
    });
    expect(completed.status).toBe(200);
    const completedBody = (await completed.json()) as TicketListResponse;
    expect(completedBody.data.map((ticket) => ticket.status)).toEqual([
      'completed',
    ]);
    expect(completedBody.data.map((ticket) => ticket.title)).toContain(
      '办公区打印机连接异常',
    );

    const pending = await fetchJson('/api/tickets?status=pending', {
      cookie: employeeCookie,
    });
    const pendingBody = (await pending.json()) as TicketListResponse;
    expect(pendingBody.data).toHaveLength(1);
    expect(pendingBody.data[0]?.status).toBe('pending');

    const handled = await fetchJson('/api/tickets?status=processing', {
      cookie: handlerCookie,
    });
    const handledBody = (await handled.json()) as TicketListResponse;
    expect(handledBody.data.map((ticket) => ticket.status)).toEqual([
      'processing',
    ]);
  });

  it("hides another employee's ticket from a direct request", async () => {
    const other = await findTicket('邮箱账号无法登录', otherEmployeeCookie);
    const response = await fetchJson(`/api/tickets/${other.id}`, {
      cookie: employeeCookie,
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'TICKET_NOT_FOUND' },
    });
  });

  it('refuses an employee starting or completing a ticket', async () => {
    const own = await findTicket('笔记本电脑无法开机', employeeCookie);
    const start = await fetchJson(`/api/tickets/${own.id}/start`, {
      method: 'POST',
      cookie: employeeCookie,
    });
    expect(start.status).toBe(403);
    await expect(start.json()).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });

    const complete = await fetchJson(`/api/tickets/${own.id}/complete`, {
      method: 'POST',
      cookie: employeeCookie,
      body: { resolution: 'done' },
    });
    expect(complete.status).toBe(403);
  });

  it('validates a submitted ticket and stores the requester', async () => {
    const invalidCategory = await fetchJson('/api/tickets', {
      method: 'POST',
      cookie: employeeCookie,
      body: { title: '显示器闪烁', category: 'printer' },
    });
    expect(invalidCategory.status).toBe(400);
    await expect(invalidCategory.json()).resolves.toMatchObject({
      error: { code: 'INVALID_CATEGORY' },
    });

    const missingTitle = await fetchJson('/api/tickets', {
      method: 'POST',
      cookie: employeeCookie,
      body: { title: '   ', category: 'computer' },
    });
    expect(missingTitle.status).toBe(400);

    const created = await fetchJson('/api/tickets', {
      method: 'POST',
      cookie: employeeCookie,
      body: {
        title: '显示器闪烁',
        category: 'computer',
        description: '外接显示器间歇性黑屏。',
      },
    });
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as TicketResponse;
    expect(data).toMatchObject({
      title: '显示器闪烁',
      category: 'computer',
      status: 'pending',
      handlerId: null,
      resolution: null,
    });

    const listed = await fetchJson('/api/tickets', {
      cookie: employeeCookie,
    });
    const body = (await listed.json()) as TicketListResponse;
    expect(body.data.map((ticket) => ticket.id)).toContain(data.id);
    expect(new Set(body.data.map((ticket) => ticket.submitterId)).size).toBe(1);
  });

  it('lets a handler see every ticket', async () => {
    const response = await fetchJson('/api/tickets', {
      cookie: handlerCookie,
    });
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as TicketListResponse;
    expect(
      new Set(data.map((ticket) => ticket.submitterId)).size,
    ).toBeGreaterThan(1);
  });

  it('requires a resolution before completing and then locks the ticket', async () => {
    const created = await fetchJson('/api/tickets', {
      method: 'POST',
      cookie: employeeCookie,
      body: { title: '键盘部分按键失灵', category: 'computer' },
    });
    const { data: ticket } = (await created.json()) as TicketResponse;

    const withoutResolution = await fetchJson(
      `/api/tickets/${ticket.id}/complete`,
      { method: 'POST', cookie: handlerCookie, body: { resolution: '  ' } },
    );
    expect(withoutResolution.status).toBe(400);
    await expect(withoutResolution.json()).resolves.toMatchObject({
      error: { code: 'INVALID_RESOLUTION' },
    });

    const started = await fetchJson(`/api/tickets/${ticket.id}/start`, {
      method: 'POST',
      cookie: handlerCookie,
    });
    expect(started.status).toBe(200);
    const startedTicket = ((await started.json()) as TicketResponse).data;
    expect(startedTicket.status).toBe('processing');
    expect(startedTicket.handlerId).not.toBeNull();

    const completed = await fetchJson(`/api/tickets/${ticket.id}/complete`, {
      method: 'POST',
      cookie: handlerCookie,
      body: { resolution: '更换键盘并测试通过。' },
    });
    expect(completed.status).toBe(200);
    const completedTicket = ((await completed.json()) as TicketResponse).data;
    expect(completedTicket).toMatchObject({
      status: 'completed',
      resolution: '更换键盘并测试通过。',
    });

    const again = await fetchJson(`/api/tickets/${ticket.id}/complete`, {
      method: 'POST',
      cookie: handlerCookie,
      body: { resolution: '再次处理。' },
    });
    expect(again.status).toBe(409);
    await expect(again.json()).resolves.toMatchObject({
      error: { code: 'TICKET_COMPLETED' },
    });
  });
});

async function fetchJson(
  pathName: string,
  options: {
    readonly method?: string;
    readonly cookie?: string;
    readonly body?: unknown;
  } = {},
): Promise<Response> {
  const headers = new Headers();
  if (options.cookie) {
    headers.set('cookie', options.cookie);
  }
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  // The authentication plugin rejects a cookie-authenticated write that
  // carries no trusted Origin, exactly as a browser would send.
  if ((options.method ?? 'GET') !== 'GET') {
    headers.set('origin', new URL(baseUrl).origin);
    headers.set('referer', `${baseUrl}/`);
  }
  return server.fetch(
    new Request(`${baseUrl}${pathName}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
}

async function signIn(username: string): Promise<string> {
  const response = await server.fetch(
    new Request(`${baseUrl}/api/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: DEMO_PASSWORD }),
    }),
  );
  expect(
    response.status,
    `sign-in for ${username} failed with ${response.status}`,
  ).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

async function findTicket(title: string, cookie: string): Promise<TicketDto> {
  const response = await fetchJson('/api/tickets', { cookie });
  expect(response.status).toBe(200);
  const { data } = (await response.json()) as TicketListResponse;
  const ticket = data.find((entry) => entry.title === title);
  expect(ticket, `no ticket titled ${title} is visible`).toBeDefined();
  return ticket as TicketDto;
}
