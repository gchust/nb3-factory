// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

// The standalone runtime refuses to start without one, exactly as it does in
// development; the value only has to be long enough for Better Auth.
process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const sourceRoot = path.resolve(import.meta.dirname, '../..');
const employeeOne = { username: 'employee1', name: '张伟' };
const employeeTwo = { username: 'employee2', name: '刘洋' };
const handler = { username: 'handler1', name: '王强' };
const password = 'Demo@123456';

let server: StandaloneServer;
let dataDir: string;
let baseUrl: string;

type Session = { cookie: string; userId: string };

function request(input: string, init?: RequestInit): Promise<Response> {
  return server.fetch(new Request(input, init));
}

async function signIn(username: string): Promise<Session> {
  const response = await request(`${baseUrl}/api/auth/sign-in/username`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ username, password }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { user: { id: string } };
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  return { cookie, userId: body.user.id };
}

async function signInWithEmail(email: string): Promise<Session> {
  const response = await request(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ email, password: 'Outsider@123456' }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { user: { id: string } };
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  return { cookie, userId: body.user.id };
}

function authed(
  session: Session,
  method: string,
  route: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {
    cookie: session.cookie,
    // Authenticated writes are cookie-authenticated, so the CSRF guard needs
    // the browser's same-origin signal — a request without it is rejected
    // before it ever reaches the ticket route.
    origin: 'http://localhost',
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return request(`${baseUrl}${route}`, init);
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function createTicket(session: Session, title: string, category = 'computer') {
  return authed(session, 'POST', '/api/tickets', { title, category });
}

type Ticket = {
  id: string;
  reference: string;
  title: string;
  status: string;
  submitterName: string;
  handlerId: string | null;
  handlerName: string | null;
  resolution: string | null;
  completedAt: string | null;
};
type ListBody = { data: Ticket[]; meta: { role: string; canProcess: boolean } };
type TicketBody = { data: Ticket };

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'nocobase-tickets-'));
  const configFile = path.join(dataDir, 'config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      auth: { secret: 'test-auth-secret-at-least-32-characters' },
      database: {
        default: 'main',
        connections: {
          main: {
            dialect: 'sqlite',
            filename: path.join(dataDir, 'database.sqlite'),
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
      APP_CONFIG_FILE: configFile,
      // Better Auth trusts the configured public origin. The in-process server
      // never binds a port, so the browser origin the tests use is named here
      // rather than inferred from a Host header.
      APP_PUBLIC_ORIGIN: 'http://localhost',
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: dataDir,
    },
    viteDevUrl: false,
  });
  baseUrl = `http://localhost${server.application.publicBasePath}`;
}, 180_000);

afterAll(async () => {
  await server?.close();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('tickets API', () => {
  it('refuses anonymous callers and signed-in users without a ticket role', async () => {
    const anonymous = await request(`${baseUrl}/api/tickets`);
    expect(anonymous.status).toBe(401);

    // A fresh registration only receives the built-in no-grant `member` set,
    // and the ticket roles are separate permission sets an administrator
    // assigns. Until then the route must refuse with 403 rather than serve
    // every ticket.
    const register = await request(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        email: 'outsider@example.com',
        name: 'Outsider',
        username: 'outsider',
        password: 'Outsider@123456',
      }),
    });
    expect(register.status).toBe(200);
    const outsider = await signInWithEmail('outsider@example.com');

    const refused = await authed(outsider, 'GET', '/api/tickets');
    expect(refused.status).toBe(403);
  });

  it('seeds three sample tickets in three statuses', async () => {
    const employee = await signIn(employeeOne.username);
    const worker = await signIn(handler.username);

    const own = await json<ListBody>(
      await authed(employee, 'GET', '/api/tickets'),
    );
    // The seeds describe one ticket per status, all visible to the handler:
    // the requester sees the two belonging to them, the handler sees all three.
    expect(own.data.map((t) => t.reference)).toEqual(
      expect.arrayContaining(['TKT-20261001-002', 'TKT-20261001-001']),
    );
    const all = await json<ListBody>(
      await authed(worker, 'GET', '/api/tickets'),
    );
    for (const status of ['pending', 'processing', 'completed']) {
      expect(all.data.some((t) => t.status === status)).toBe(true);
    }
    const completed = all.data.find((t) => t.status === 'completed');
    expect(completed?.resolution).toBeTruthy();
    expect(completed?.handlerName).toBe(handler.name);
  });

  it('scopes an employee to their own tickets and hides another to a direct read', async () => {
    const first = await signIn(employeeOne.username);
    const second = await signIn(employeeTwo.username);

    const firstList = await json<ListBody>(
      await authed(first, 'GET', '/api/tickets'),
    );
    const secondList = await json<ListBody>(
      await authed(second, 'GET', '/api/tickets'),
    );

    expect(firstList.meta).toMatchObject({
      role: 'employee',
      canProcess: false,
    });
    expect(
      firstList.data.every((t) => t.submitterName === employeeOne.name),
    ).toBe(true);
    expect(
      secondList.data.every((t) => t.submitterName === employeeTwo.name),
    ).toBe(true);
    expect(firstList.data.length).toBeGreaterThan(0);
    expect(secondList.data.length).toBeGreaterThan(0);

    // Direct address of another employee's ticket is answered as if it does
    // not exist, so neither the record nor the fact that the id is real leaks.
    const foreign = secondList.data[0];
    const foreignRead = await authed(
      first,
      'GET',
      `/api/tickets/${foreign.id}`,
    );
    expect(foreignRead.status).toBe(404);

    // An employee can never perform the handler transition, even on their own
    // ticket: the role check runs before any status check.
    const own = await json<TicketBody>(
      await createTicket(first, '键盘无响应', 'computer'),
    );
    expect(own.data.status).toBe('pending');
    const forbidden = await authed(
      first,
      'POST',
      `/api/tickets/${own.data.id}/start`,
    );
    expect(forbidden.status).toBe(403);
    const stillPending = await json<TicketBody>(
      await authed(first, 'GET', `/api/tickets/${own.data.id}`),
    );
    expect(stillPending.data.status).toBe('pending');
    expect(stillPending.data.handlerName).toBeNull();
  });

  it('records the real handler, requires a resolution, and freezes a completed ticket', async () => {
    const employee = await signIn(employeeOne.username);
    const worker = await signIn(handler.username);

    const created = await json<TicketBody>(
      await createTicket(employee, '显示器不亮', 'computer'),
    );
    const id = created.data.id;
    expect(created.data.handlerName).toBeNull();

    const started = await json<TicketBody>(
      await authed(worker, 'POST', `/api/tickets/${id}/start`),
    );
    expect(started.data.status).toBe('processing');
    expect(started.data.handlerId).toBe(worker.userId);
    expect(started.data.handlerName).toBe(handler.name);

    // Repeating a transition that already happened is a conflict, not a
    // second write.
    expect(
      (await authed(worker, 'POST', `/api/tickets/${id}/start`)).status,
    ).toBe(409);

    // Completion requires a resolution note at the server, not only in the
    // browser form.
    const emptyResolution = await authed(
      worker,
      'POST',
      `/api/tickets/${id}/complete`,
      { resolution: '   ' },
    );
    expect(emptyResolution.status).toBe(400);

    const completed = await json<TicketBody>(
      await authed(worker, 'POST', `/api/tickets/${id}/complete`, {
        resolution: '已更换数据线，显示恢复。',
      }),
    );
    expect(completed.data.status).toBe('completed');
    expect(completed.data.resolution).toBe('已更换数据线，显示恢复。');
    expect(completed.data.completedAt).toBeTruthy();

    // A completed ticket is immutable: neither transition can run again, and
    // the stored resolution does not change.
    expect(
      (
        await authed(worker, 'POST', `/api/tickets/${id}/complete`, {
          resolution: '再次完成',
        })
      ).status,
    ).toBe(409);
    expect(
      (await authed(worker, 'POST', `/api/tickets/${id}/start`)).status,
    ).toBe(409);

    // The submitter sees the completion result and the real handler, and the
    // status filter matches the stored status.
    const own = await json<TicketBody>(
      await authed(employee, 'GET', `/api/tickets/${id}`),
    );
    expect(own.data.status).toBe('completed');
    expect(own.data.handlerName).toBe(handler.name);
    expect(own.data.resolution).toBe('已更换数据线，显示恢复。');

    const filtered = await json<ListBody>(
      await authed(employee, 'GET', '/api/tickets?status=completed'),
    );
    expect(filtered.data.some((t) => t.id === id)).toBe(true);
    expect(filtered.data.every((t) => t.status === 'completed')).toBe(true);
  });

  it('rejects a bad create payload and an unknown status filter', async () => {
    const employee = await signIn(employeeOne.username);

    const noTitle = await authed(employee, 'POST', '/api/tickets', {
      category: 'computer',
    });
    expect(noTitle.status).toBe(400);

    const blankTitle = await authed(employee, 'POST', '/api/tickets', {
      title: '   ',
      category: 'computer',
    });
    expect(blankTitle.status).toBe(400);

    const badCategory = await authed(employee, 'POST', '/api/tickets', {
      title: 'x',
      category: 'printer',
    });
    expect(badCategory.status).toBe(400);

    const badFilter = await authed(employee, 'GET', '/api/tickets?status=open');
    expect(badFilter.status).toBe(400);
  });
});
