// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { createDatabaseTest } from '@nocobase/app-testing/server';
import { describe, expect } from 'vitest';

import { TodosService } from '../../server/providers/todos/service.js';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'todos-service-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

const test = createDatabaseTest({ migrations: sources });

const HOUR = 60 * 60 * 1000;

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

describe('TodosService', () => {
  test('orders the list by due time, earliest first', async ({ database }) => {
    const service = new TodosService(database);
    await service.create({ title: 'later', dueAt: iso(5 * HOUR) });
    await service.create({ title: 'overdue', dueAt: iso(-HOUR) });
    await service.create({ title: 'soon', dueAt: iso(HOUR) });

    const todos = await service.list();

    expect(todos.map((todo) => todo.title)).toEqual([
      'overdue',
      'soon',
      'later',
    ]);
  });

  test('sets the overdue flag when a todo is created', async ({ database }) => {
    const service = new TodosService(database);

    const future = await service.create({
      title: 'future',
      dueAt: iso(HOUR),
    });
    const past = await service.create({ title: 'past', dueAt: iso(-HOUR) });

    expect(future.expired).toBe(false);
    expect(past.expired).toBe(true);
    expect((await service.get(future.id))?.title).toBe('future');
  });

  test('keeps completion and expiry consistent on update', async ({
    database,
  }) => {
    const service = new TodosService(database);
    const todo = await service.create({
      title: 'overdue',
      dueAt: iso(-HOUR),
    });
    expect(todo.expired).toBe(true);

    const completed = await service.update(todo.id, { completed: true });
    expect(completed?.completed).toBe(true);
    expect(completed?.expired).toBe(false);

    const reopened = await service.update(todo.id, { completed: false });
    expect(reopened?.completed).toBe(false);
    expect(reopened?.expired).toBe(true);

    const postponed = await service.update(todo.id, { dueAt: iso(HOUR) });
    expect(postponed?.expired).toBe(false);
    expect(new Date(postponed?.dueAt ?? 0).getTime()).toBeGreaterThan(
      Date.now(),
    );

    expect(await service.update(999_999, { title: 'missing' })).toBeUndefined();
  });

  test('deletes an existing todo and reports a missing one', async ({
    database,
  }) => {
    const service = new TodosService(database);
    const todo = await service.create({ title: 'remove me', dueAt: iso(HOUR) });

    await expect(service.remove(todo.id)).resolves.toBe(true);
    await expect(service.get(todo.id)).resolves.toBeUndefined();
    await expect(service.remove(todo.id)).resolves.toBe(false);
  });

  test('marks only unfinished past-due todos and leaves other records alone', async ({
    database,
  }) => {
    const service = new TodosService(database);
    const future = await service.create({
      title: 'future',
      dueAt: iso(HOUR),
    });
    const past = await service.create({
      title: 'past',
      dueAt: iso(-2 * HOUR),
    });
    const done = await service.create({
      title: 'done',
      dueAt: iso(-HOUR),
    });
    await service.update(done.id, { completed: true });

    const repository = database.repository('todos');
    // The scheduled check is what marks an overdue record, so start it stale.
    await repository.updateOne({
      filter: { id: past.id },
      values: { expired: false },
    });
    // Future and completed records are outside the rule even when their flag is
    // wrong, so a run must leave them exactly as they are.
    await repository.updateOne({
      filter: { id: future.id },
      values: { expired: true },
    });
    await repository.updateOne({
      filter: { id: done.id },
      values: { expired: true },
    });

    const result = await service.markOverdue(new Date());

    expect(result.updatedCount).toBe(1);
    expect(result.todos.map((todo) => todo.id)).toEqual([
      past.id,
      done.id,
      future.id,
    ]);
    expect(result.todos.find((todo) => todo.id === past.id)?.expired).toBe(
      true,
    );
    expect(result.todos.find((todo) => todo.id === future.id)?.expired).toBe(
      true,
    );
    expect(result.todos.find((todo) => todo.id === done.id)?.expired).toBe(
      true,
    );

    await expect(service.markOverdue(new Date())).resolves.toMatchObject({
      updatedCount: 0,
    });
  });
});
