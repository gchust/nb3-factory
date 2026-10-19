// @vitest-environment node
import type { SeedContext } from '@nocobase/db';
import { expect, test } from 'vitest';

import sampleTodos from '../../database/main/seeds/202610070002_sample_todos.js';

interface SeedRow {
  id: string;
  title: string;
  dueAt: Date;
  completed: boolean;
  expired: boolean;
}

/**
 * The seed only needs a repository with the two methods it calls, so a Map-backed
 * stub exercises it without a database.
 */
function createContext() {
  const rows = new Map<string, SeedRow>();
  const context = {
    repository() {
      return {
        findOne: async ({ filter }: { filter: { id: string } }) =>
          rows.get(filter.id) ?? null,
        createOne: async ({ values }: { values: SeedRow }) => {
          rows.set(values.id, values);
          return values;
        },
      };
    },
  };
  return { rows, context: context as unknown as SeedContext };
}

test('seeds the three inspectable states once', async () => {
  const { rows, context } = createContext();

  await sampleTodos.run(context);

  expect(sampleTodos.sample).toBe(true);
  expect(sampleTodos.name).toBe('202610070002_sample_todos');
  expect([...rows.values()]).toMatchObject([
    { title: 'Overdue todo', completed: false, expired: false },
    { title: 'Upcoming todo', completed: false, expired: false },
    { title: 'Completed todo', completed: true, expired: false },
  ]);
  const [overdue, upcoming, completed] = [...rows.values()];
  expect(overdue.dueAt.getTime()).toBeLessThan(Date.now());
  expect(upcoming.dueAt.getTime()).toBeGreaterThan(Date.now());
  expect(completed.dueAt.getTime()).toBeLessThan(Date.now());

  // Re-running must not duplicate rows.
  await sampleTodos.run(context);
  expect(rows.size).toBe(3);
});
