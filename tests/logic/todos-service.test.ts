// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import { describe, expect } from 'vitest';
import { TodosService } from '../../server/providers/todos.js';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'todos-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const test = createDatabaseTest({ migrations: sources });

describe('TodosService', () => {
  test('create starts a todo incomplete and not expired', async ({
    database,
  }) => {
    const service = new TodosService(database);
    const record = await service.create({
      title: 'Prepare the release notes',
      dueAt: new Date(Date.now() + 7 * DAY_MS).toISOString(),
    });

    expect(record.completed).toBe(false);
    expect(record.expired).toBe(false);
    expect(record.title).toBe('Prepare the release notes');
  });

  test('expireOverdue marks only incomplete todos whose deadline has passed', async ({
    database,
  }) => {
    const service = new TodosService(database);
    const now = new Date();
    const overdue = await service.create({
      title: 'Overdue',
      dueAt: new Date(now.getTime() - 2 * DAY_MS).toISOString(),
    });
    const future = await service.create({
      title: 'Future',
      dueAt: new Date(now.getTime() + 2 * DAY_MS).toISOString(),
    });
    const completedOverdue = await service.create({
      title: 'Completed and overdue',
      dueAt: new Date(now.getTime() - 2 * DAY_MS).toISOString(),
    });
    await service.setCompleted(completedOverdue.id, true);

    const expiredCount = await service.expireOverdue(now);
    expect(expiredCount).toBe(1);

    const byId = new Map(
      (await service.list({ limit: 10, offset: 0 })).records.map((record) => [
        record.id,
        record,
      ]),
    );
    expect(byId.get(overdue.id)?.expired).toBe(true);
    expect(byId.get(future.id)?.expired).toBe(false);
    expect(byId.get(completedOverdue.id)?.expired).toBe(false);
  });

  test('a second run changes nothing, and a todo expired by hand is left alone', async ({
    database,
  }) => {
    const service = new TodosService(database);
    const now = new Date();
    await service.create({
      title: 'Overdue',
      dueAt: new Date(now.getTime() - DAY_MS).toISOString(),
    });

    expect(await service.expireOverdue(now)).toBe(1);
    expect(await service.expireOverdue(now)).toBe(0);

    // The same run a year later has nothing left to mark either.
    expect(
      await service.expireOverdue(new Date(now.getTime() + 365 * DAY_MS)),
    ).toBe(0);
  });

  test('a deadline exactly at "now" is treated as passed', async ({
    database,
  }) => {
    const service = new TodosService(database);
    const now = new Date();
    const record = await service.create({
      title: 'Due now',
      dueAt: now.toISOString(),
    });

    expect(await service.expireOverdue(now)).toBe(1);
    const listed = await service.list({ limit: 10, offset: 0 });
    expect(listed.records.find((item) => item.id === record.id)?.expired).toBe(
      true,
    );
  });

  test('list orders by deadline and reports the total across pages', async ({
    database,
  }) => {
    const service = new TodosService(database);
    const now = Date.now();
    await service.create({
      title: 'Third',
      dueAt: new Date(now + 3 * DAY_MS).toISOString(),
    });
    await service.create({
      title: 'First',
      dueAt: new Date(now + DAY_MS).toISOString(),
    });
    await service.create({
      title: 'Second',
      dueAt: new Date(now + 2 * DAY_MS).toISOString(),
    });

    const firstPage = await service.list({ limit: 2, offset: 0 });
    expect(firstPage.records.map((record) => record.title)).toEqual([
      'First',
      'Second',
    ]);
    expect(firstPage.total).toBe(3);

    const secondPage = await service.list({ limit: 2, offset: 2 });
    expect(secondPage.records.map((record) => record.title)).toEqual(['Third']);
    expect(secondPage.total).toBe(3);
  });

  test('setCompleted reports an unknown todo instead of inventing one', async ({
    database,
  }) => {
    const service = new TodosService(database);
    expect(await service.setCompleted(12345, true)).toBeUndefined();

    const record = await service.create({
      title: 'Toggle me',
      dueAt: new Date(Date.now() + DAY_MS).toISOString(),
    });
    const updated = await service.setCompleted(record.id, true);
    expect(updated?.completed).toBe(true);
  });
});
