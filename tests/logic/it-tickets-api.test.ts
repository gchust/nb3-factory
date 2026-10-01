// @vitest-environment node

/**
 * End-to-end verification of the IT repair feature against a real application:
 * the migration creates the table, the seeds create the job permission sets and
 * the demonstration data, and the HTTP endpoints enforce the business rules for
 * the two kinds of user. It starts the application on a temporary SQLite file,
 * so it never touches the development database.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  IT_EMPLOYEE_SET_KEY,
  IT_HANDLER_SET_KEY,
} from '../../database/seed-data/it-tickets.ts';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

interface DemoUser {
  readonly username: string;
  readonly name: string;
}

const EMPLOYEE: DemoUser = { username: 'employee.li', name: '李静' };
const EMPLOYEE_OTHER: DemoUser = { username: 'employee.wang', name: '王强' };
const HANDLER: DemoUser = { username: 'handler.chen', name: '陈涛' };
const PASSWORD = 'ItDemo#2026';

let server: StandaloneServer;
let database: DatabaseManager;
let baseUrl: string;
let databaseDir: string;
const sessions = new Map<string, string>();

function request(pathname: string, init: RequestInit = {}): Promise<Response> {
  return server.fetch(new Request(`${baseUrl}${pathname}`, init));
}

function jsonRequest(
  pathname: string,
  body: unknown,
  cookie?: string,
): Promise<Response> {
  return request(pathname, {
    method: 'POST',
    headers: {
      // The authentication plugin's CSRF guard rejects a cookie-bearing write
      // with no Origin or Referer, exactly as it would from a browser.
      origin: 'http://localhost',
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function signIn(user: DemoUser): Promise<string> {
  const response = await jsonRequest('/api/auth/sign-in/username', {
    username: user.username,
    password: PASSWORD,
  });
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  expect(cookie).not.toBe('');
  sessions.set(user.username, cookie);
  return cookie;
}

function authed(cookie: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { ...(init.headers ?? {}), cookie },
  };
}

beforeAll(async () => {
  process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  databaseDir = mkdtempSync(path.join(tmpdir(), 'it-tickets-api-database-'));
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
    env: { DB_DIALECT: 'sqlite', APP_CONFIG_FILE: configFile },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir: path.join(sourceRoot, 'dist/client'),
      storageDir: databaseDir,
    },
  });
  database = server.application.container.resolve(databaseManagerToken);
  baseUrl = `http://localhost${server.application.publicBasePath}`;

  await signIn(EMPLOYEE);
  await signIn(EMPLOYEE_OTHER);
  await signIn(HANDLER);
}, 60_000);

afterAll(async () => {
  await server?.close();
  if (databaseDir) {
    rmSync(databaseDir, { recursive: true, force: true });
  }
});

describe('IT ticket seeds', () => {
  it('creates the demonstration accounts and sample tickets', async () => {
    const query = database.query('main');
    const users = await query
      .selectFrom('user')
      .select(['username', 'name'])
      .where('username', 'in', [
        EMPLOYEE.username,
        EMPLOYEE_OTHER.username,
        HANDLER.username,
      ])
      .execute();
    expect(users.map((row) => `${row.username}:${row.name}`).sort()).toEqual([
      `${EMPLOYEE.username}:${EMPLOYEE.name}`,
      `${EMPLOYEE_OTHER.username}:${EMPLOYEE_OTHER.name}`,
      `${HANDLER.username}:${HANDLER.name}`,
    ]);

    const tickets = await query
      .selectFrom('itTickets')
      .select(['id', 'status', 'ownerId', 'handlerId'])
      .orderBy('id', 'asc')
      .execute();
    expect(tickets).toEqual([
      {
        id: 'it-demo-ticket-001',
        status: 'pending',
        ownerId: 'it-demo-user-employee-li',
        handlerId: null,
      },
      {
        id: 'it-demo-ticket-002',
        status: 'in_progress',
        ownerId: 'it-demo-user-employee-wang',
        handlerId: 'it-demo-user-handler-chen',
      },
      {
        id: 'it-demo-ticket-003',
        status: 'completed',
        ownerId: 'it-demo-user-employee-li',
        handlerId: 'it-demo-user-handler-chen',
      },
    ]);
  });

  it('assigns the employee and handler permission sets', async () => {
    const query = database.query('main');
    const sets = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', 'in', [IT_EMPLOYEE_SET_KEY, IT_HANDLER_SET_KEY])
      .execute();
    expect(sets.map((row) => row.key).sort()).toEqual(
      [IT_EMPLOYEE_SET_KEY, IT_HANDLER_SET_KEY].sort(),
    );

    const assignments = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['subjectId', 'permissionSetKey'])
      .where('subjectId', 'in', [
        'it-demo-user-employee-li',
        'it-demo-user-employee-wang',
        'it-demo-user-handler-chen',
      ])
      .execute();
    expect(assignments).toEqual([
      {
        subjectId: 'it-demo-user-employee-li',
        permissionSetKey: IT_EMPLOYEE_SET_KEY,
      },
      {
        subjectId: 'it-demo-user-employee-wang',
        permissionSetKey: IT_EMPLOYEE_SET_KEY,
      },
      {
        subjectId: 'it-demo-user-handler-chen',
        permissionSetKey: IT_HANDLER_SET_KEY,
      },
    ]);
  });

  it('does not duplicate the fixtures when the seeds run again', async () => {
    // The seed files are idempotent by key, so inserting the same rows through
    // the same unique keys a second time would violate the primary key. Re-run
    // both seeds directly and confirm the counts are unchanged.
    const { default: usersSeed } =
      await import('../../database/main/seeds/202609300002_it_tickets_demo_users.ts');
    const { default: setsSeed } =
      await import('../../database/main/seeds/202609300003_it_tickets_permission_sets.ts');
    const { default: ticketsSeed } =
      await import('../../database/main/seeds/202609300004_it_tickets_sample_tickets.ts');
    const query = database.query('main');
    await usersSeed.run({ query } as never);
    await setsSeed.run({ query } as never);
    await ticketsSeed.run({ query } as never);
    const users = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', EMPLOYEE.username)
      .execute();
    expect(users).toHaveLength(1);
    const tickets = await query
      .selectFrom('itTickets')
      .select('id')
      .where('id', 'like', 'it-demo-ticket-%')
      .execute();
    expect(tickets).toHaveLength(3);
    const assignments = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('id', 'like', 'user:it-demo-user-%')
      .execute();
    expect(assignments).toHaveLength(3);
  });
});

describe('IT ticket HTTP endpoints', () => {
  it('rejects anonymous requests', async () => {
    const response = await request('/api/it-tickets');
    expect(response.status).toBe(401);
  });

  it('scopes an employee to their own tickets and hides another employee’s record', async () => {
    const cookie = sessions.get(EMPLOYEE.username) ?? '';
    const list = await request('/api/it-tickets', authed(cookie));
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      data: { id: string; ownerId: string }[];
    };
    expect(body.data.map((ticket) => ticket.id).sort()).toEqual([
      'it-demo-ticket-001',
      'it-demo-ticket-003',
    ]);

    const other = await request(
      '/api/it-tickets/it-demo-ticket-002',
      authed(cookie),
    );
    expect(other.status).toBe(404);
  });

  it('does not let an employee start or complete a ticket', async () => {
    const cookie = sessions.get(EMPLOYEE.username) ?? '';
    const start = await jsonRequest(
      '/api/it-tickets/it-demo-ticket-001/start',
      {},
      cookie,
    );
    expect(start.status).toBe(403);
    const complete = await jsonRequest(
      '/api/it-tickets/it-demo-ticket-001/complete',
      { resolution: 'not allowed' },
      cookie,
    );
    expect(complete.status).toBe(403);
  });

  it('lets a handler see every ticket and drive one to completion', async () => {
    const cookie = sessions.get(HANDLER.username) ?? '';
    const list = await request('/api/it-tickets', authed(cookie));
    expect(list.status).toBe(200);
    const body = (await list.json()) as { data: { id: string }[] };
    expect(body.data.map((ticket) => ticket.id).sort()).toEqual([
      'it-demo-ticket-001',
      'it-demo-ticket-002',
      'it-demo-ticket-003',
    ]);

    const started = await jsonRequest(
      '/api/it-tickets/it-demo-ticket-001/start',
      {},
      cookie,
    );
    expect(started.status).toBe(200);
    await expect(started.json()).resolves.toMatchObject({
      data: {
        id: 'it-demo-ticket-001',
        status: 'in_progress',
        handlerId: 'it-demo-user-handler-chen',
      },
    });

    const completed = await jsonRequest(
      '/api/it-tickets/it-demo-ticket-001/complete',
      { resolution: '已更换电源适配器并确认可以正常开机。' },
      cookie,
    );
    expect(completed.status).toBe(200);
    await expect(completed.json()).resolves.toMatchObject({
      data: {
        id: 'it-demo-ticket-001',
        status: 'completed',
        resolution: '已更换电源适配器并确认可以正常开机。',
      },
    });
  });

  it('requires a handling note before a ticket can be completed', async () => {
    const cookie = sessions.get(HANDLER.username) ?? '';
    const response = await jsonRequest(
      '/api/it-tickets/it-demo-ticket-002/complete',
      { resolution: '   ' },
      cookie,
    );
    expect(response.status).toBe(400);
  });

  it('refuses to modify a completed ticket again', async () => {
    const cookie = sessions.get(HANDLER.username) ?? '';
    const complete = await jsonRequest(
      '/api/it-tickets/it-demo-ticket-001/complete',
      { resolution: 'again' },
      cookie,
    );
    expect(complete.status).toBe(409);

    const start = await jsonRequest(
      '/api/it-tickets/it-demo-ticket-001/start',
      {},
      cookie,
    );
    expect(start.status).toBe(409);
  });

  it('lets an employee create a ticket that starts pending and is owned by them', async () => {
    const cookie = sessions.get(EMPLOYEE.username) ?? '';
    const created = await jsonRequest(
      '/api/it-tickets',
      {
        title: '显示器画面闪烁',
        category: 'computer',
        description: '外接显示器在切换窗口时闪屏。',
      },
      cookie,
    );
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      data: {
        title: '显示器画面闪烁',
        category: 'computer',
        status: 'pending',
        ownerId: 'it-demo-user-employee-li',
        ownerName: EMPLOYEE.name,
        handlerId: null,
        resolution: null,
      },
    });
  });

  it('rejects a category outside the three allowed values', async () => {
    const cookie = sessions.get(EMPLOYEE.username) ?? '';
    const response = await jsonRequest(
      '/api/it-tickets',
      {
        title: '无效分类',
        category: 'printer',
        description: '分类不在允许范围内。',
      },
      cookie,
    );
    expect(response.status).toBe(400);
  });

  it('filters the list by status', async () => {
    const cookie = sessions.get(HANDLER.username) ?? '';
    const response = await request(
      '/api/it-tickets?status=completed',
      authed(cookie),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { id: string }[] };
    expect(body.data.map((ticket) => ticket.id)).toEqual([
      'it-demo-ticket-003',
      'it-demo-ticket-001',
    ]);
  });
});
