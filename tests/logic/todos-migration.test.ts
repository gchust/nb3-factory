// @vitest-environment node
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import path from 'node:path';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'todos-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The table the todo page reads and the expiry schedule updates.
describeMigration('202610070001_create_todos', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const todos = await expectCollection('todos').toExist();
    expect(Object.keys(todos.fields)).toEqual(
      expect.arrayContaining([
        'id',
        'title',
        'dueAt',
        'completed',
        'expired',
        'createdAt',
      ]),
    );
    expect(todos.primaryKey).toEqual(['id']);
    await expectCollection('todos').toHaveField('title', { nullable: false });
    await expectCollection('todos').toHaveField('dueAt', { nullable: false });
    await expectCollection('todos').toHaveField('completed', {
      nullable: false,
    });
    await expectCollection('todos').toHaveField('expired', { nullable: false });
    await expectCollection('todos').toHaveField('createdAt', {
      nullable: false,
    });

    // The two flags default to false, so a row inserted without them is neither completed nor expired.
    await connection.query
      .insertInto('todos')
      .values({ title: 'a', dueAt: new Date(), createdAt: new Date() })
      .execute();
    const rows = await connection.query
      .selectFrom('todos')
      .selectAll()
      .execute();
    expect(rows).toHaveLength(1);
    expect(Boolean(rows[0].completed)).toBe(false);
    expect(Boolean(rows[0].expired)).toBe(false);

    // A row without its required title is refused.
    await expect(
      connection.query
        .insertInto('todos')
        .values({ dueAt: new Date(), createdAt: new Date() })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('todos').not.toExist();
  },
});
