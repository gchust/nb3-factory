// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'todos-migration-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202610060002_create_todos', {
  sources,
  up: async ({ expectCollection }) => {
    const todos = await expectCollection('todos').toExist();
    expect(Object.keys(todos.fields)).toEqual([
      'id',
      'title',
      'dueAt',
      'completed',
      'expired',
    ]);
    expect(todos.primaryKey).toEqual(['id']);
    await expectCollection('todos').toHaveField('title', {
      nullable: false,
      length: 200,
    });
    await expectCollection('todos').toHaveField('dueAt', {
      nullable: false,
    });
    await expectCollection('todos').toHaveField('completed', {
      nullable: false,
    });
    await expectCollection('todos').toHaveField('expired', {
      nullable: false,
    });
    await expectCollection('todos').toHaveIndex(['dueAt']);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('todos').not.toExist();
  },
});
