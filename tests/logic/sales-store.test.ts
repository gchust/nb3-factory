// @vitest-environment node
import type { DatabaseManager } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

import { DatabaseSalesStore } from '../../server/providers/sales-service.js';

interface FindManyOptions {
  readonly filter?: Record<string, unknown>;
  readonly sort?: unknown;
}

interface FakeStore {
  readonly database: DatabaseManager;
  readonly calls: FindManyOptions[];
}

/**
 * A stand-in for the database manager whose repository mimics the real one in
 * the one way that matters here: it refuses an empty filter shorthand. Passing
 * `filter: {}` to `findMany` is a repository error, not an empty result, so a
 * list with no filter must leave the key out entirely.
 */
function fakeDatabase(rows: Record<string, unknown>[]): FakeStore {
  const calls: FindManyOptions[] = [];
  const repository = {
    findMany(options: FindManyOptions = {}) {
      if (
        options.filter !== undefined &&
        Object.keys(options.filter).length === 0
      ) {
        return Promise.reject(new Error('Filter shorthand must not be empty.'));
      }
      calls.push(options);
      return Promise.resolve(rows);
    },
    findOne: () => Promise.resolve(undefined),
    createOne: () => Promise.resolve({ record: {} }),
    updateOne: () => Promise.resolve({ record: {} }),
  };
  return {
    database: {
      repository: () => repository,
    } as unknown as DatabaseManager,
    calls,
  };
}

describe('database sales store', () => {
  it('lists contacts without a filter without sending an empty one', async () => {
    const fake = fakeDatabase([
      {
        id: 1,
        name: 'Alice Chen',
        phone: null,
        email: null,
        customerId: 1,
        createdAt: '2026-01-05T09:00:00.000Z',
        updatedAt: '2026-01-05T09:00:00.000Z',
      },
    ]);
    const contacts = await new DatabaseSalesStore(fake.database).listContacts();

    expect(contacts).toHaveLength(1);
    expect(fake.calls[0]?.filter).toBeUndefined();
  });

  it('lists opportunities without a filter without sending an empty one', async () => {
    const fake = fakeDatabase([]);
    await new DatabaseSalesStore(fake.database).listOpportunities();

    expect(fake.calls[0]?.filter).toBeUndefined();
  });

  it('passes a customer filter through', async () => {
    const fake = fakeDatabase([]);
    await new DatabaseSalesStore(fake.database).listContacts({ customerId: 2 });

    expect(fake.calls[0]?.filter).toEqual({ customerId: 2 });
  });

  it('passes a stage filter through', async () => {
    const fake = fakeDatabase([]);
    await new DatabaseSalesStore(fake.database).listOpportunities({
      stage: 'won',
    });

    expect(fake.calls[0]?.filter).toEqual({ stage: 'won' });
  });

  it('normalises a stored opportunity row', async () => {
    const fake = fakeDatabase([
      {
        id: '7',
        name: 42,
        customerId: '3',
        amount: '1200.5',
        stage: 'nonsense',
        createdAt: '2026-01-05T09:00:00.000Z',
        updatedAt: '2026-01-05T09:00:00.000Z',
      },
    ]);
    const [opportunity] = await new DatabaseSalesStore(
      fake.database,
    ).listOpportunities();

    expect(opportunity).toMatchObject({
      id: 7,
      name: '42',
      customerId: 3,
      amount: 1200.5,
      stage: 'following',
    });
  });
});
