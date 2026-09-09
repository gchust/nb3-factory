import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createAppMigrator } from '@nocobase/app-server/database';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  TeamTodoNotFoundError,
  TeamTodoService,
  TeamTodoValidationError,
} from '../../server/providers/team-todos.js';

const migrationsDirectory = path.resolve(
  import.meta.dirname,
  '../../database/migrations',
);

describe('TeamTodoService', () => {
  let database: DatabaseManager;
  let service: TeamTodoService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'team-todos-service-'));
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: path.join(tempDir, 'test.sqlite'),
        },
      },
    });
    await database.connect();
    await createAppMigrator({
      database,
      config: {
        directory: migrationsDirectory,
        packageName: 'nb3-factory',
        autoRun: true,
      },
    }).latest();
    service = new TeamTodoService(database);
  });

  afterEach(async () => {
    await database.destroy();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a todo with defaults and returns it', async () => {
    const created = await service.create({ title: '  写周报  ' });
    expect(created.id).toBeGreaterThan(0);
    expect(created.title).toBe('写周报');
    expect(created.status).toBe('pending');
    expect(created.priority).toBe('normal');
    expect(created.description).toBeNull();
    expect(created.dueDate).toBeNull();
    expect(created.createdAt).toBeTruthy();
    expect(created.updatedAt).toBeTruthy();
  });

  it('rejects an empty title', async () => {
    await expect(service.create({ title: '   ' })).rejects.toThrow(
      TeamTodoValidationError,
    );
    await expect(service.create({ title: '   ' })).rejects.toMatchObject({
      code: 'TITLE_REQUIRED',
    });
  });

  it('rejects a title longer than 100 characters', async () => {
    await expect(
      service.create({ title: 'x'.repeat(101) }),
    ).rejects.toMatchObject({ code: 'TITLE_TOO_LONG' });
  });

  it('rejects invalid status and priority values', async () => {
    await expect(
      service.create({ title: 'ok', status: 'done' as never }),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS' });
    await expect(
      service.create({ title: 'ok', priority: 'high' as never }),
    ).rejects.toMatchObject({ code: 'INVALID_PRIORITY' });
  });

  it('rejects a malformed due date', async () => {
    await expect(
      service.create({ title: 'ok', dueDate: '2026/09/09' }),
    ).rejects.toMatchObject({ code: 'INVALID_DUE_DATE' });
  });

  it('lists todos with stats computed over all records', async () => {
    await service.create({ title: 'a', status: 'pending' });
    await service.create({ title: 'b', status: 'inProgress' });
    await service.create({ title: 'c', status: 'completed' });
    await service.create({ title: 'd', status: 'completed' });

    const result = await service.list();
    expect(result.data).toHaveLength(4);
    expect(result.stats).toEqual({
      all: 4,
      pending: 1,
      inProgress: 1,
      completed: 2,
    });
  });

  it('filters by status and searches by title without changing stats', async () => {
    await service.create({ title: '修复登录页', status: 'pending' });
    await service.create({ title: '修复样式', status: 'completed' });
    await service.create({ title: '写文档', status: 'pending' });

    const byStatus = await service.list({ status: 'pending' });
    expect(byStatus.data.map((todo) => todo.title)).toEqual([
      '写文档',
      '修复登录页',
    ]);
    expect(byStatus.stats.all).toBe(3);

    const bySearch = await service.list({ search: '修复' });
    expect(bySearch.data.map((todo) => todo.title)).toEqual([
      '修复样式',
      '修复登录页',
    ]);
    expect(bySearch.stats.all).toBe(3);
  });

  it('updates only the provided fields', async () => {
    const created = await service.create({
      title: 'original',
      description: 'desc',
      status: 'pending',
      priority: 'normal',
      dueDate: '2026-09-10',
    });

    const updated = await service.update(created.id, {
      description: 'new desc',
      status: 'inProgress',
    });
    expect(updated.title).toBe('original');
    expect(updated.description).toBe('new desc');
    expect(updated.status).toBe('inProgress');
    expect(updated.priority).toBe('normal');
    expect(updated.dueDate).toBe('2026-09-10');
  });

  it('throws not-found when updating or removing a missing todo', async () => {
    await expect(service.update(9999, { title: 'x' })).rejects.toThrow(
      TeamTodoNotFoundError,
    );
    await expect(service.remove(9999)).resolves.toBe(false);
  });

  it('removes a todo', async () => {
    const created = await service.create({ title: 'to remove' });
    await expect(service.remove(created.id)).resolves.toBe(true);
    const result = await service.list();
    expect(result.data).toHaveLength(0);
    expect(result.stats.all).toBe(0);
  });
});
