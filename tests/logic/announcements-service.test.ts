import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAnnouncementService } from '../../server/providers/announcements.js';
import { createTestDatabase, type TestDatabase } from '../support/database.js';

let testDatabase: TestDatabase;

beforeEach(async () => {
  testDatabase = await createTestDatabase();
  await testDatabase.migrate();
});

afterEach(async () => {
  await testDatabase.cleanup();
});

describe('announcementService', () => {
  it('stores an announcement and reads it back with a usable timestamp', async () => {
    const service = createAnnouncementService(testDatabase.database);

    const created = await service.create({ title: 'Hello', body: 'World' });

    expect(created.id).toBeTypeOf('number');
    expect(created.title).toBe('Hello');
    expect(created.body).toBe('World');
    expect(Number.isNaN(new Date(created.createdAt).getTime())).toBe(false);

    // A second service reading the same database proves the write was persisted, not held in memory.
    const persisted = createAnnouncementService(testDatabase.database);
    const list = await persisted.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: created.id,
      title: 'Hello',
      body: 'World',
      createdAt: created.createdAt,
    });
  });

  it('lists announcements newest first', async () => {
    const service = createAnnouncementService(testDatabase.database);
    await service.create({ title: 'First', body: 'one' });
    await service.create({ title: 'Second', body: 'two' });

    const list = await service.list();

    expect(list.map((announcement) => announcement.title)).toEqual([
      'Second',
      'First',
    ]);
  });
});
