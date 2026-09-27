// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

interface Running {
  readonly app: StandaloneServer;
  readonly baseUrl: string;
}

const apps: StandaloneServer[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A NocoBase config with a throwaway SQLite database, migrations and seeds. */
function writeTestConfig(directory: string): string {
  const file = path.join(directory, 'config.json');
  writeFileSync(
    file,
    JSON.stringify({
      app: { publicOrigin: 'http://localhost' },
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

/**
 * Boots a real application against a throwaway database so the routes are
 * exercised with the production authentication and authorization stack.
 */
async function startApp(): Promise<Running> {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const databaseDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-meeting-routes-database-'),
  );
  tempDirs.push(databaseDir);

  const app = await createStandaloneServer({
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: 'true',
      DB_SEEDS_AUTO_RUN: 'true',
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
  apps.push(app);
  return {
    app,
    baseUrl: `http://localhost${app.application.publicBasePath}`,
  };
}

interface Caller {
  readonly running: Running;
  readonly cookie: string;
}

async function request(
  running: Running,
  route: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = running.app.fetch(
    new Request(`${running.baseUrl}${route}`, init),
  );
  return response instanceof Promise ? response : Promise.resolve(response);
}

async function json(
  caller: Caller,
  method: string,
  route: string,
  body?: unknown,
): Promise<Response> {
  return request(caller.running, route, {
    method,
    headers: {
      'content-type': 'application/json',
      // The authentication plugin rejects cookie-bearing writes without a
      // trusted origin, exactly as a browser would send one.
      origin: 'http://localhost',
      cookie: caller.cookie,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

/** Signs a freshly created account up and in, returning its session cookie. */
async function register(
  running: Running,
  username: string,
  email: string,
): Promise<Caller> {
  const signUp = await request(running, '/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username,
      email,
      password: 'employee-password',
      name: username,
    }),
  });
  if (!signUp.ok) {
    throw new Error(`sign-up failed: ${signUp.status} ${await signUp.text()}`);
  }
  const signIn = await request(running, '/api/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'employee-password' }),
  });
  if (!signIn.ok) {
    throw new Error(`sign-in failed: ${signIn.status} ${await signIn.text()}`);
  }
  return { running, cookie: cookieOf(signIn) };
}

async function signInAdmin(running: Running): Promise<Caller> {
  const response = await request(running, '/api/auth/sign-in/username', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'nocobase', password: 'admin123' }),
  });
  if (!response.ok) {
    throw new Error(`admin sign-in failed: ${response.status}`);
  }
  return { running, cookie: cookieOf(response) };
}

/** A slot far in the future so the tests never depend on the clock. */
const SLOT = {
  startAt: '2099-01-05T10:00',
  endAt: '2099-01-05T11:00',
};

describe('meeting room and booking routes', () => {
  it('answers an anonymous caller with 401 and a signed-in employee with the rooms', async () => {
    const running = await startApp();
    expect((await request(running, '/api/meeting-rooms')).status).toBe(401);

    const employee = await register(running, 'employeeone', 'one@example.com');
    const response = await json(employee, 'GET', '/api/meeting-rooms');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { name: string }[] };
    expect(body.data.map((room) => room.name)).toEqual(
      expect.arrayContaining(['Orchid', 'Cedar', 'Summit']),
    );
  });

  it('lets only the administrator maintain rooms', async () => {
    const running = await startApp();
    const employee = await register(running, 'employeetwo', 'two@example.com');
    const admin = await signInAdmin(running);

    const forbidden = await json(employee, 'POST', '/api/meeting-rooms', {
      name: 'Nook',
      capacity: 2,
    });
    expect(forbidden.status).toBe(403);

    const created = await json(admin, 'POST', '/api/meeting-rooms', {
      name: 'Nook',
      capacity: 2,
      location: 'Basement',
    });
    expect(created.status).toBe(201);
    const room = ((await created.json()) as { data: { id: number } }).data;

    const duplicate = await json(admin, 'POST', '/api/meeting-rooms', {
      name: 'Nook',
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ code: 'ROOM_NAME_TAKEN' });

    const updated = await json(
      admin,
      'PATCH',
      `/api/meeting-rooms/${room.id}`,
      { name: 'Nook', capacity: 6 },
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ data: { capacity: 6 } });

    const employeeDelete = await json(
      employee,
      'DELETE',
      `/api/meeting-rooms/${room.id}`,
    );
    expect(employeeDelete.status).toBe(403);

    const deleted = await json(
      admin,
      'DELETE',
      `/api/meeting-rooms/${room.id}`,
    );
    expect(deleted.status).toBe(200);
  });

  it('books a free slot, refuses an overlap, and keeps each employee to their own bookings', async () => {
    const running = await startApp();
    const first = await register(running, 'employeethree', 'three@example.com');
    const second = await register(running, 'employeefour', 'four@example.com');

    const rooms = (await (
      await json(first, 'GET', '/api/meeting-rooms')
    ).json()) as { data: { id: number; name: string }[] };
    const roomId = rooms.data.find((room) => room.name === 'Cedar')!.id;

    const created = await json(first, 'POST', '/api/meeting-bookings', {
      title: 'Design review',
      roomId,
      ...SLOT,
    });
    expect(created.status).toBe(201);
    const booking = (await created.json()) as {
      data: { id: number; ownerId: string; status: string };
    };
    expect(booking.data.status).toBe('confirmed');

    const own = (await (
      await json(first, 'GET', '/api/meeting-bookings')
    ).json()) as { data: { id: number }[] };
    expect(own.data.map((entry) => entry.id)).toContain(booking.data.id);

    const others = (await (
      await json(second, 'GET', '/api/meeting-bookings')
    ).json()) as { data: { id: number }[] };
    expect(others.data.map((entry) => entry.id)).not.toContain(booking.data.id);

    const overlap = await json(second, 'POST', '/api/meeting-bookings', {
      title: 'Clashing review',
      roomId,
      startAt: '2099-01-05T10:30',
      endAt: '2099-01-05T11:30',
    });
    expect(overlap.status).toBe(409);
    expect(await overlap.json()).toMatchObject({ code: 'BOOKING_CONFLICT' });

    const stolen = await json(
      second,
      'POST',
      `/api/meeting-bookings/${booking.data.id}/cancel`,
    );
    expect(stolen.status).toBe(404);

    const cancelled = await json(
      first,
      'POST',
      `/api/meeting-bookings/${booking.data.id}/cancel`,
    );
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({
      data: { status: 'cancelled' },
    });

    // The freed slot can be taken by the other employee.
    const replacement = await json(second, 'POST', '/api/meeting-bookings', {
      title: 'Replacement review',
      roomId,
      ...SLOT,
    });
    expect(replacement.status).toBe(201);
  });

  it('lets the administrator see every booking', async () => {
    const running = await startApp();
    const employee = await register(
      running,
      'employeefive',
      'five@example.com',
    );
    const admin = await signInAdmin(running);
    const rooms = (await (
      await json(employee, 'GET', '/api/meeting-rooms')
    ).json()) as { data: { id: number; name: string }[] };
    const roomId = rooms.data[0]!.id;

    await json(employee, 'POST', '/api/meeting-bookings', {
      title: 'One on one',
      roomId,
      ...SLOT,
    });

    const all = (await (
      await json(admin, 'GET', '/api/meeting-bookings')
    ).json()) as { data: { title: string }[] };
    expect(all.data.map((entry) => entry.title)).toContain('One on one');
  });

  it('rejects an invalid payload with 400', async () => {
    const running = await startApp();
    const employee = await register(running, 'employeesix', 'six@example.com');
    const rooms = (await (
      await json(employee, 'GET', '/api/meeting-rooms')
    ).json()) as { data: { id: number; name: string }[] };
    const roomId = rooms.data[0]!.id;

    const backwards = await json(employee, 'POST', '/api/meeting-bookings', {
      title: 'Backwards',
      roomId,
      startAt: '2099-01-05T11:00',
      endAt: '2099-01-05T10:00',
    });
    expect(backwards.status).toBe(400);
    expect(await backwards.json()).toMatchObject({
      code: 'INVALID_TIME_RANGE',
    });

    const nameless = await json(employee, 'POST', '/api/meeting-bookings', {
      roomId,
      ...SLOT,
    });
    expect(nameless.status).toBe(400);

    const absentRoom = await json(employee, 'POST', '/api/meeting-bookings', {
      title: 'Ghost room',
      roomId: 999_999,
      ...SLOT,
    });
    expect(absentRoom.status).toBe(404);
    expect(await absentRoom.json()).toMatchObject({ code: 'ROOM_NOT_FOUND' });
  });
});
