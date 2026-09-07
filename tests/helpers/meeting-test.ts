import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  createDatabaseManager,
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Hono } from 'hono';

import bookingsMigration from '../../database/migrations/202609070002_create_meeting_bookings.js';
import roomsMigration from '../../database/migrations/202609070001_create_meeting_rooms.js';
import MeetingBookingProvider from '../../server/providers/meeting-bookings.js';
import MeetingRoomProvider from '../../server/providers/meeting-rooms.js';
import { meetingBookingApiRoutes } from '../../server/routes/meeting-bookings.js';
import { meetingRoomApiRoutes } from '../../server/routes/meeting-rooms.js';

export interface TestApp {
  readonly database: DatabaseManager;
  readonly container: ServiceContainer;
  readonly roomRouter: Hono;
  readonly bookingRouter: Hono;
  readonly disconnect: () => Promise<void>;
}

/** A fake authenticated session; the routes only need identity, not a real better-auth session. */
export const fakeAuth = {
  required:
    () =>
    async (
      context: {
        set: (key: string, value: unknown) => void;
        req: { header: (name: string) => string | undefined };
        json: (body: unknown, status: number) => Response;
      },
      next: () => Promise<void>,
    ) => {
      // Requests without the test header are treated as anonymous and rejected,
      // so the 401 path can be exercised too.
      if (context.req.header('x-test-auth') !== '1') {
        return context.json(
          { error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } },
          401,
        );
      }
      context.set('auth', {
        user: { id: '1', email: 'admin@example.com' },
        session: {},
      });
      await next();
    },
} as unknown as Auth;

export async function createTestApp(): Promise<TestApp> {
  const database = createDatabaseManager({
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  await database.connect();

  const context = {
    builder: database.builder(),
    query: database.query(),
    connection: database.connection(),
  };
  await roomsMigration.up(context);
  await bookingsMigration.up(context);

  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  container.instance(authenticationToken, fakeAuth);
  new MeetingRoomProvider({ container } as never).register();
  new MeetingBookingProvider({ container } as never).register();

  const roomRouter = await meetingRoomApiRoutes.createRouter({
    container,
  } as never);
  const bookingRouter = await meetingBookingApiRoutes.createRouter({
    container,
  } as never);

  return {
    database,
    container,
    roomRouter,
    bookingRouter,
    disconnect: () => database.disconnect(),
  };
}

export async function seedRooms(database: DatabaseManager): Promise<void> {
  const now = new Date();
  await database
    .query()
    .insertInto('meetingRooms')
    .values([
      {
        code: 'R-101',
        name: '会议室A',
        location: '一楼东侧',
        capacity: 8,
        equipment: '投影仪',
        available: true,
        createdAt: now,
      },
      {
        code: 'R-102',
        name: '会议室B',
        location: '一楼西侧',
        capacity: 12,
        equipment: '投影仪、白板',
        available: true,
        createdAt: now,
      },
      {
        code: 'R-201',
        name: '会议室C',
        location: '二楼',
        capacity: 20,
        equipment: '投影仪、音响',
        available: false,
        createdAt: now,
      },
    ])
    .execute();
}

export async function roomIdByCode(
  database: DatabaseManager,
  code: string,
): Promise<number> {
  const room = await database
    .query()
    .selectFrom('meetingRooms')
    .select('id')
    .where('code', '=', code)
    .executeTakeFirst<{ id: number }>();
  if (!room) {
    throw new Error(`Room ${code} not found.`);
  }
  return Number(room.id);
}

export function jsonRequest(
  method: 'POST' | 'PUT',
  body: unknown,
): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-auth': '1' },
    body: JSON.stringify(body),
  };
}

/** A plain authenticated request (no body). */
export function authRequest(method: 'POST'): RequestInit {
  return { method, headers: { 'x-test-auth': '1' } };
}

/** An authenticated GET request. */
export function authGet(): RequestInit {
  return { method: 'GET', headers: { 'x-test-auth': '1' } };
}
