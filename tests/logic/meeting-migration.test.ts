// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { databaseManagerToken } from '@nocobase/db';
import type { MigrationContext, SeedContext } from '@nocobase/db';
import { createStandaloneServer } from '../../server/standalone.ts';
import createMeetingRoomsMigration from '../../database/main/migrations/202609100001_create_meeting_rooms.ts';
import createMeetingBookingsMigration from '../../database/main/migrations/202609100002_create_meeting_bookings.ts';
import { seedMeetingRooms } from '../../database/main/seeds/202609100003_meeting_rooms_examples.ts';
import {
  MEETING_EMPLOYEE_SET,
  seedMeetingPermissions,
} from '../../database/main/seeds/202609100004_meeting_permissions.ts';

process.env.AUTH_SECRET ??= 'test-auth-secret-at-least-32-characters';

const apps: { close(): Promise<void> }[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface StartOptions {
  /**
   * When true the whole application migration set runs on startup, which
   * creates the authorization tables the permission seed writes to and the
   * tables every plugin expects. The meeting migrations are then driven
   * directly so both directions and repeat runs are exercised.
   */
  readonly autoRunMigrations?: boolean;
}

/**
 * A standalone application against a real temporary SQLite database. The
 * migration `up`/`down` and the seeds are driven directly so both directions
 * and repeat runs are exercised, not just the happy startup path.
 */
async function startDatabase(options: StartOptions = {}) {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const directory = mkdtempSync(
    path.join(tmpdir(), 'nocobase-meeting-migration-'),
  );
  tempDirs.push(directory);
  const configFile = path.join(directory, 'config.json');
  const autoRun = options.autoRunMigrations !== false;
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
            filename: path.join(directory, 'database.sqlite'),
          },
        },
        migrations: { autoRun },
        seeds: { autoRun: false },
      },
      hub: { host: { enabled: false } },
    }),
  );
  const app = await createStandaloneServer({
    env: {
      DB_DIALECT: 'sqlite',
      DB_MIGRATIONS_AUTO_RUN: autoRun ? 'true' : 'false',
      DB_SEEDS_AUTO_RUN: 'false',
      APP_CONFIG_FILE: configFile,
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
  const manager = app.application.container.resolve(databaseManagerToken);
  const query = manager.query();
  const context = {
    builder: manager.builder(),
    query,
    repository: manager.repository.bind(manager),
  } as unknown as MigrationContext;
  return {
    app,
    query,
    context,
    seedContext: context as unknown as SeedContext,
  };
}

describe('meeting migrations and seeds', () => {
  it('creates the tables on up and removes them on down', async () => {
    const { query, context } = await startDatabase();

    // The application migrations already created the tables; drop them in
    // reverse dependency order and prove they really disappear, then bring
    // them back with the same `up` an installation runs.
    await createMeetingBookingsMigration.down(context);
    await createMeetingRoomsMigration.down(context);

    await expect(
      query.selectFrom('meetingBookings').selectAll().execute(),
    ).rejects.toThrow();
    await expect(
      query.selectFrom('meetingRooms').selectAll().execute(),
    ).rejects.toThrow();

    await createMeetingRoomsMigration.up(context);
    await createMeetingBookingsMigration.up(context);

    expect(
      await query.selectFrom('meetingRooms').selectAll().execute(),
    ).toEqual([]);
    expect(
      await query.selectFrom('meetingBookings').selectAll().execute(),
    ).toEqual([]);
  });

  it('keeps the booking foreign key and the unique room name enforced', async () => {
    const { query, context } = await startDatabase();
    await createMeetingBookingsMigration.down(context);
    await createMeetingRoomsMigration.down(context);
    await createMeetingRoomsMigration.up(context);
    await createMeetingBookingsMigration.up(context);

    await query
      .insertInto('meetingRooms')
      .values({
        name: 'Orchid',
        capacity: 8,
        createdAt: '2099-01-01T00:00:00.000',
        updatedAt: '2099-01-01T00:00:00.000',
      })
      .execute();
    await expect(
      query
        .insertInto('meetingRooms')
        .values({
          name: 'Orchid',
          capacity: 2,
          createdAt: '2099-01-01T00:00:00.000',
          updatedAt: '2099-01-01T00:00:00.000',
        })
        .execute(),
    ).rejects.toThrow();
    await expect(
      query
        .insertInto('meetingBookings')
        .values({
          title: 'Ghost',
          roomId: 999_999,
          ownerId: 'user-1',
          startAt: '2099-01-05T10:00:00.000',
          endAt: '2099-01-05T11:00:00.000',
          status: 'confirmed',
          createdAt: '2099-01-01T00:00:00.000',
          updatedAt: '2099-01-01T00:00:00.000',
        })
        .execute(),
    ).rejects.toThrow();
  });

  it('seeds example rooms once and stays idempotent on a second run', async () => {
    const { query, seedContext } = await startDatabase();

    await seedMeetingRooms(seedContext);
    const first = await query.selectFrom('meetingRooms').selectAll().execute();
    expect(first.map((room) => room['name']).sort()).toEqual([
      'Cedar',
      'Orchid',
      'Summit',
    ]);

    // A second run finds every row by name and inserts nothing, leaving an
    // operator's edit alone.
    await query
      .updateTable('meetingRooms')
      .set({ capacity: 99 })
      .where('name', '=', 'Cedar')
      .execute();
    await seedMeetingRooms(seedContext);
    const second = await query.selectFrom('meetingRooms').selectAll().execute();
    expect(second).toHaveLength(3);
    expect(second.find((room) => room['name'] === 'Cedar')?.['capacity']).toBe(
      99,
    );
  });

  it('seeds the employee permission set and assignment once', async () => {
    const { query, seedContext } = await startDatabase();

    await seedMeetingPermissions(seedContext);
    await seedMeetingPermissions(seedContext);

    const sets = await query
      .selectFrom('authorizationPermissionSets')
      .selectAll()
      .where('key', '=', MEETING_EMPLOYEE_SET)
      .execute();
    expect(sets).toHaveLength(1);
    expect(JSON.parse(sets[0]!['grants'] as string)).toMatchObject([
      { resource: { type: 'composite', id: 'meeting.rooms' } },
      { resource: { type: 'composite', id: 'meeting.bookings' } },
    ]);

    const assignments = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .selectAll()
      .where('permissionSetKey', '=', MEETING_EMPLOYEE_SET)
      .execute();
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      subjectType: 'authenticated',
      subjectId: '*',
    });
  });
});
