import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

import bookingsMigration from '../database/migrations/202609070002_create_meeting_bookings.js';
import roomsMigration from '../database/migrations/202609070001_create_meeting_rooms.js';

async function createDatabase(): Promise<DatabaseManager> {
  const database = createDatabaseManager({
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  await database.connect();
  return database;
}

function context(database: DatabaseManager) {
  return {
    builder: database.builder(),
    query: database.query(),
    connection: database.connection(),
  };
}

async function tableNames(database: DatabaseManager): Promise<string[]> {
  const rows = await database
    .query()
    .selectFrom('sqlite_master')
    .select('name')
    .where('type', '=', 'table')
    .where('name', 'not like', 'sqlite_%')
    .execute<{ name: string }>();
  return rows.map((row) => row.name).sort();
}

describe('meeting migrations', () => {
  it('creates and drops the meetingRooms table', async () => {
    const database = await createDatabase();
    try {
      await roomsMigration.up(context(database));
      expect(await tableNames(database)).toContain('meeting_rooms');

      // The table accepts a full room row.
      await database
        .query()
        .insertInto('meetingRooms')
        .values({
          code: 'R-101',
          name: '会议室A',
          location: '一楼',
          capacity: 8,
          equipment: '投影仪',
          available: true,
          createdAt: new Date(),
        })
        .execute();

      await roomsMigration.down(context(database));
      expect(await tableNames(database)).not.toContain('meeting_rooms');
    } finally {
      await database.disconnect();
    }
  });

  it('creates and drops the meetingBookings table with its foreign key', async () => {
    const database = await createDatabase();
    try {
      await roomsMigration.up(context(database));
      await bookingsMigration.up(context(database));
      expect(await tableNames(database)).toContain('meeting_bookings');

      const room = await database
        .query()
        .insertInto('meetingRooms')
        .values({
          code: 'R-101',
          name: '会议室A',
          location: '一楼',
          capacity: 8,
          equipment: '投影仪',
          available: true,
          createdAt: new Date(),
        })
        .execute();
      const roomId = Number(room.insertId);

      await database
        .query()
        .insertInto('meetingBookings')
        .values({
          title: '测试预约',
          roomId,
          organizer: '张三',
          startTime: new Date('2026-09-08T09:00:00'),
          endTime: new Date('2026-09-08T10:00:00'),
          notes: null,
          status: 'booked',
          createdAt: new Date(),
        })
        .execute();

      // down drops bookings first, then rooms (dependency order).
      await bookingsMigration.down(context(database));
      expect(await tableNames(database)).not.toContain('meeting_bookings');
      await roomsMigration.down(context(database));
      expect(await tableNames(database)).not.toContain('meeting_rooms');
    } finally {
      await database.disconnect();
    }
  });
});
