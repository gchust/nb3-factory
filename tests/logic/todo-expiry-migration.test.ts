// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'todo-expiry-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The table the `todos.check-expired` schedule reads and writes.
describeMigration('202610070001_create_todos', {
  sources,
  up: async ({ connection, expectCollection }) => {
    await expectCollection('todos').toExist();
    await expectCollection('todos').toHaveField('id', { nullable: false });
    await expectCollection('todos').toHaveField('title', { nullable: false });
    await expectCollection('todos').toHaveField('dueAt', { nullable: false });
    await expectCollection('todos').toHaveField('completed', {
      nullable: false,
    });
    await expectCollection('todos').toHaveField('expired', { nullable: false });
    await expectCollection('todos').toHaveIndex([
      'expired',
      'completed',
      'dueAt',
    ]);

    // A row that leaves both booleans out takes the migration's defaults.
    await connection.query
      .insertInto('todos')
      .values({ title: 'defaults', dueAt: new Date() })
      .execute();
    const row = await connection.query
      .selectFrom('todos')
      .selectAll()
      .where('title', '=', 'defaults')
      .executeTakeFirstOrThrow();
    expect(row.completed).toBeFalsy();
    expect(row.expired).toBeFalsy();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('todos').not.toExist();
  },
});
