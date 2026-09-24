// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

type TicketStatus = 'pending' | 'processing' | 'completed';

interface Ticket {
  readonly id: number;
  readonly title: string;
  readonly category: string;
  readonly status: TicketStatus;
  readonly submitterId: string;
  readonly submitterName: string | null;
  readonly handlerId: string | null;
  readonly handlerName: string | null;
  readonly handlingNote: string | null;
}

interface TicketList {
  readonly data: Ticket[];
  readonly meta: { readonly canCreate: boolean; readonly canProcess: boolean };
}

interface TicketResult {
  readonly data: Ticket;
}

const TEST_PASSWORD = 'admin123';
const SECRET = 'test-auth-secret-at-least-32-characters';
const servers: StandaloneServer[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await server.close();
  }
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('ticket business flow', () => {
  it('scopes tickets by role and advances a ticket through its states', async () => {
    const server = await startTicketsServer();
    const baseUrl = `http://localhost${server.application.publicBasePath}`;

    // A ticket endpoint is not public, whatever the page is.
    const anonymous = await request(server, `${baseUrl}/api/tickets`);
    expect(anonymous.status).toBe(401);

    const employeeCookie = await signIn(server, baseUrl, 'employee1');
    const handlerCookie = await signIn(server, baseUrl, 'handler1');

    // The employee sees only the tickets they submitted, and may raise one.
    const employeeList = await getTickets(
      server,
      `${baseUrl}/api/tickets`,
      employeeCookie,
    );
    expect(employeeList.meta).toEqual({
      canCreate: true,
      canProcess: false,
    });
    expect(employeeList.data.length).toBeGreaterThanOrEqual(2);
    for (const ticket of employeeList.data) {
      expect(ticket.submitterName).toBe('Employee One');
    }

    // The handler sees every ticket and may process, but not raise one.
    const handlerList = await getTickets(
      server,
      `${baseUrl}/api/tickets`,
      handlerCookie,
    );
    expect(handlerList.meta).toEqual({
      canCreate: false,
      canProcess: true,
    });
    expect(handlerList.data.length).toBeGreaterThanOrEqual(3);
    const othersTicket = handlerList.data.find(
      (ticket) => ticket.submitterName === 'Employee Two',
    );
    expect(othersTicket).toBeDefined();

    // Server-sourced scope: another employee's ticket is invisible, not
    // merely absent from the list.
    const hidden = await request(
      server,
      `${baseUrl}/api/tickets/${othersTicket!.id}`,
      { headers: { cookie: employeeCookie } },
    );
    expect(hidden.status).toBe(404);

    // The submitter is the session, not the payload: a client cannot claim
    // to be somebody else.
    const created = await postTicket(
      server,
      `${baseUrl}/api/tickets`,
      employeeCookie,
      {
        title: 'VPN will not connect',
        category: 'other',
        description: 'The client hangs on the login screen.',
        submitterId: 'some-other-user',
      },
    );
    expect(created.status).toBe(201);
    const raised = (await json<TicketResult>(created)).data;
    expect(raised.status).toBe('pending');
    expect(raised.submitterName).toBe('Employee One');
    expect(raised.handlerName).toBeNull();

    // A required field is enforced before anything is written.
    const invalid = await postTicket(
      server,
      `${baseUrl}/api/tickets`,
      employeeCookie,
      { title: '', category: 'other' },
    );
    expect(invalid.status).toBe(400);

    // An employee cannot advance a ticket's status; the grant is missing, so
    // the request is refused before the row is read.
    const employeeStart = await postTicket(
      server,
      `${baseUrl}/api/tickets/${raised.id}/start`,
      employeeCookie,
      { handlingNote: 'not allowed' },
    );
    expect(employeeStart.status).toBe(403);

    // The handler moves it waiting -> in progress with a required note.
    const started = await postTicket(
      server,
      `${baseUrl}/api/tickets/${raised.id}/start`,
      handlerCookie,
      { handlingNote: 'Reissued the VPN profile.' },
    );
    expect(started.status).toBe(200);
    const processing = (await json<TicketResult>(started)).data;
    expect(processing.status).toBe('processing');
    expect(processing.handlerName).toBe('Handler One');
    expect(processing.handlingNote).toBe('Reissued the VPN profile.');

    // Completing without a new note keeps the one it was started with.
    const completed = await postTicket(
      server,
      `${baseUrl}/api/tickets/${raised.id}/complete`,
      handlerCookie,
      {},
    );
    expect(completed.status).toBe(200);
    const done = (await json<TicketResult>(completed)).data;
    expect(done.status).toBe('completed');
    expect(done.handlingNote).toBe('Reissued the VPN profile.');

    // A completed ticket is read-only: the same transition is refused.
    const repeated = await postTicket(
      server,
      `${baseUrl}/api/tickets/${raised.id}/complete`,
      handlerCookie,
      { handlingNote: 'again' },
    );
    expect(repeated.status).toBe(409);

    // A status filter narrows the list without widening it.
    const pending = await getTickets(
      server,
      `${baseUrl}/api/tickets?status=pending`,
      handlerCookie,
    );
    expect(pending.data.length).toBeGreaterThan(0);
    for (const ticket of pending.data) {
      expect(ticket.status).toBe('pending');
    }
  }, 120_000);
});

/** Boot this application against a throwaway SQLite database, migrations and seeds included. */
async function startTicketsServer(): Promise<StandaloneServer> {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const databaseDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-tickets-test-'),
  );
  tempDirs.push(databaseDir);

  // A stand-in for the built SPA so this test does not depend on `pnpm build`
  // having run first; every request it makes is to the API.
  const clientDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-tickets-client-'),
  );
  tempDirs.push(clientDir);
  writeFileSync(
    path.join(clientDir, 'index.html'),
    '<main>Tickets test</main>',
  );

  const configFile = path.join(databaseDir, 'config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      app: { publicOrigin: 'http://localhost' },
      auth: { secret: SECRET },
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
    },
    paths: {
      rootDir: sourceRoot,
      serverDir: path.join(sourceRoot, 'server'),
      databaseDir: path.join(sourceRoot, 'database'),
      clientDir,
      storageDir: path.join(sourceRoot, 'storage'),
    },
  });
  servers.push(server);
  return server;
}

async function signIn(
  server: StandaloneServer,
  baseUrl: string,
  username: string,
): Promise<string> {
  const response = await request(
    server,
    `${baseUrl}/api/auth/sign-in/username`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: TEST_PASSWORD }),
    },
  );
  // The seeded accounts share the initial administrator's configured password.
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

async function getTickets(
  server: StandaloneServer,
  url: string,
  cookie: string,
): Promise<TicketList> {
  const response = await request(server, url, { headers: { cookie } });
  expect(response.status).toBe(200);
  return json<TicketList>(response);
}

function postTicket(
  server: StandaloneServer,
  url: string,
  cookie: string,
  body: Readonly<Record<string, unknown>>,
): Promise<Response> {
  return request(server, url, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function request(
  server: StandaloneServer,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  // The API refuses a state-changing request whose Origin does not match the
  // host, so every request in this test carries the origin it is aimed at.
  const headers = new Headers(init?.headers);
  headers.set('origin', new URL(url).origin);
  return Promise.resolve(server.fetch(new Request(url, { ...init, headers })));
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
