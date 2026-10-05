// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { databaseManagerToken } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type {
  ItTicket,
  ItTicketsListResult,
} from '../../client/pages/it-tickets/api.js';
import {
  DEMO_PASSWORD,
  demoAccounts,
  demoTickets,
} from '../../database/seed-data/it-tickets-demo.js';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.js';

/**
 * The business rules of the IT repair-request feature, exercised through the
 * real HTTP endpoints of a standalone application backed by a migrated and
 * seeded SQLite database.
 *
 * These are integration tests on purpose. The feature's whole promise is that
 * an employee cannot see or move someone else's request, and that promise is
 * kept by the permission sets and the record scopes they expand to — not by
 * anything the page renders. Calling the service with a stubbed authorization
 * context would prove the handler functions and miss that.
 */
type TestApp = StandaloneServer & { close(): Promise<void> };

const tempDirs: string[] = [];
const sessions = new Map<string, string>();
/** Browser writes carry an Origin; the cookie-write CSRF check requires one. */
const ORIGIN = 'http://localhost';

let app: TestApp;
let baseUrl: string;

function request(
  input: string,
  init?: RequestInit,
): Response | Promise<Response> {
  return app.fetch(new Request(input, init));
}

async function signIn(username: string, password: string): Promise<string> {
  const response = await request(`${baseUrl}/api/auth/sign-in/username`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ username, password }),
  });
  expect(response.status, `sign in as ${username}`).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

async function cookieFor(username: string): Promise<string> {
  const existing = sessions.get(username);
  if (existing !== undefined) {
    return existing;
  }
  const account = demoAccounts.find((item) => item.username === username);
  expect(account, `a demonstration account named ${username}`).toBeDefined();
  const cookie = await signIn(username, DEMO_PASSWORD);
  sessions.set(username, cookie);
  return cookie;
}

function ticketUrl(id?: number): string {
  return id === undefined
    ? `${baseUrl}/api/it/tickets`
    : `${baseUrl}/api/it/tickets/${id}`;
}

async function listTickets(cookie: string): Promise<ItTicketsListResult> {
  const response = await request(ticketUrl(), { headers: { cookie } });
  expect(response.status).toBe(200);
  return (await response.json()) as ItTicketsListResult;
}

async function post(
  cookie: string,
  url: string,
  body?: unknown,
): Promise<Response> {
  return request(url, {
    method: 'POST',
    headers: {
      cookie,
      origin: ORIGIN,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function createTicket(
  cookie: string,
  title: string,
  category: 'computer' | 'account' | 'other' = 'other',
): Promise<ItTicket> {
  const response = await post(cookie, ticketUrl(), {
    title,
    category,
    description: `Filed by a test at ${new Date().toISOString()}.`,
  });
  expect(response.status).toBe(201);
  const payload = (await response.json()) as { data: ItTicket };
  return payload.data;
}

async function createSeededStandaloneServer(): Promise<TestApp> {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const databaseDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-it-tickets-database-'),
  );
  tempDirs.push(databaseDir);
  const clientDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-it-tickets-client-'),
  );
  tempDirs.push(clientDir);
  writeFileSync(
    path.join(clientDir, 'index.html'),
    '<main>IT repair-request test client</main>',
  );
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
    env: { APP_CONFIG_FILE: configFile, APP_PUBLIC_ORIGIN: ORIGIN },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir,
      storageDir: path.join(sourceRoot, 'storage'),
    },
  });
  return server as TestApp;
}

describe('IT repair requests', () => {
  beforeAll(async () => {
    app = await createSeededStandaloneServer();
    baseUrl = `http://localhost${app.application.publicBasePath}`;
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses every request from an anonymous caller', async () => {
    const response = await request(ticketUrl());
    expect(response.status).toBe(401);
  });

  it('shows an employee only their own requests, and hides another employee’s request even by its id', async () => {
    const employee = await cookieFor('lia.employee');
    const handler = await cookieFor('chen.handler');

    const all = await listTickets(handler);
    const foreign = all.data.find(
      (ticket) => ticket.title === demoTickets[1].title,
    );
    expect(
      foreign,
      'the demonstration request filed by the other employee',
    ).toBeDefined();
    expect(foreign?.requesterName).toBe('Lei Wang');

    const mine = await listTickets(employee);
    expect(mine.data.length).toBeGreaterThan(0);
    for (const ticket of mine.data) {
      expect(ticket.requesterName).toBe('Lina Zhao');
    }
    expect(mine.data.map((ticket) => ticket.id)).not.toContain(foreign?.id);

    const direct = await request(ticketUrl(foreign?.id as number), {
      headers: { cookie: employee },
    });
    expect(direct.status).toBe(404);
  });

  it('installs the demonstration accounts and requests', async () => {
    // The seed runs during startup, so this asserts the sample data is what
    // the environment actually contains rather than only what the module says.
    const handler = await cookieFor('chen.handler');
    const all = await listTickets(handler);
    expect(all.data).toHaveLength(demoTickets.length);
    expect(all.counts).toEqual({
      pending: 1,
      processing: 1,
      completed: 1,
    });
  });

  it('files a request as pending, and an employee cannot start or complete it', async () => {
    const employee = await cookieFor('lia.employee');
    const created = await createTicket(
      employee,
      'The keyboard on my desk stopped responding',
      'computer',
    );
    expect(created.status).toBe('pending');
    expect(created.category).toBe('computer');
    expect(created.requesterName).toBe('Lina Zhao');
    expect(created.handlerId).toBeNull();
    expect(created.canStart).toBe(false);
    expect(created.canComplete).toBe(false);

    const started = await post(employee, `${ticketUrl(created.id)}/start`);
    expect(started.status).toBe(403);

    const completed = await post(
      employee,
      `${ticketUrl(created.id)}/complete`,
      {
        resolution: 'I fixed it myself.',
      },
    );
    expect(completed.status).toBe(403);

    const reread = await request(ticketUrl(created.id), {
      headers: { cookie: employee },
    });
    expect(reread.status).toBe(200);
    await expect(reread.json()).resolves.toMatchObject({
      data: { status: 'pending', resolution: null },
    });
  });

  it('lets a handler start and complete a request, and freezes a completed request', async () => {
    const employee = await cookieFor('lia.employee');
    const handler = await cookieFor('chen.handler');
    const created = await createTicket(
      employee,
      'The printer on the second floor is offline',
      'other',
    );

    const started = await post(handler, `${ticketUrl(created.id)}/start`);
    expect(started.status).toBe(200);
    const processing = ((await started.json()) as { data: ItTicket }).data;
    expect(processing.status).toBe('processing');
    expect(processing.handlerName).toBe('Wei Chen');
    expect(processing.startedAt).not.toBeNull();

    const withoutResolution = await post(
      handler,
      `${ticketUrl(created.id)}/complete`,
      { resolution: '   ' },
    );
    expect(withoutResolution.status).toBe(400);

    const completed = await post(handler, `${ticketUrl(created.id)}/complete`, {
      resolution: 'Replaced the network cable.',
    });
    expect(completed.status).toBe(200);
    const finished = ((await completed.json()) as { data: ItTicket }).data;
    expect(finished.status).toBe('completed');
    expect(finished.resolution).toBe('Replaced the network cable.');
    expect(finished.completedAt).not.toBeNull();

    const again = await post(handler, `${ticketUrl(created.id)}/complete`, {
      resolution: 'Trying to overwrite the result.',
    });
    expect(again.status).toBe(409);

    const restart = await post(handler, `${ticketUrl(created.id)}/start`);
    expect(restart.status).toBe(409);

    const reread = await request(ticketUrl(created.id), {
      headers: { cookie: handler },
    });
    await expect(reread.json()).resolves.toMatchObject({
      data: {
        status: 'completed',
        resolution: 'Replaced the network cable.',
      },
    });
  });

  it('counts each status over the requests the caller may see, and filters by status', async () => {
    const handler = await cookieFor('chen.handler');
    const response = await request(`${ticketUrl()}?status=processing`, {
      headers: { cookie: handler },
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as ItTicketsListResult;
    expect(result.counts.processing).toBeGreaterThanOrEqual(1);
    expect(result.data.length).toBe(result.counts.processing);
    for (const ticket of result.data) {
      expect(ticket.status).toBe('processing');
    }
  });

  it('lets an administrator grant a new colleague the same permissions as a demonstration account', async () => {
    const admin = await signIn('nocobase', 'admin123');

    const sets = await request(`${baseUrl}/api/authz/permission-sets`, {
      headers: { cookie: admin },
    });
    expect(sets.status).toBe(200);
    const keys = ((await sets.json()) as { data: { key: string }[] }).data.map(
      (set) => set.key,
    );
    expect(keys).toContain('it-employee');
    expect(keys).toContain('it-processor');

    const query = app.application.container
      .resolve(databaseManagerToken)
      .query('main');
    const userId = crypto.randomUUID();
    const now = new Date();
    await query
      .insertInto('user')
      .values({
        id: userId,
        name: 'New Colleague',
        username: 'new.colleague',
        email: 'new.colleague@example.com',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await query
      .insertInto('account')
      .values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: 'credential',
        userId,
        password: await hashPassword('NewColleague#2026'),
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const newCookie = await signIn('new.colleague', 'NewColleague#2026');
    const before = await request(ticketUrl(), {
      headers: { cookie: newCookie },
    });
    expect(before.status).toBe(403);

    const assigned = await post(
      admin,
      `${baseUrl}/api/authz/permission-sets/it-employee/assignments`,
      { subject: { type: 'user', id: userId } },
    );
    expect(assigned.status).toBe(201);

    const after = await listTickets(newCookie);
    expect(after.canCreate).toBe(true);
    expect(after.data).toEqual([]);
  });
});
