// @vitest-environment node
import { rmSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import fieldVisitSeed from '../../database/main/seeds/202609220002_seed_field_visits.js';
import type { SeedContext } from '@nocobase/db';
import { createFieldVisitsTestDatabase } from '../fixtures/field-visits-database.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function fixture() {
  const database = await createFieldVisitsTestDatabase();
  directories.push(database.directory);
  return database;
}

describe('field visits migration', () => {
  it('creates the table and enforces required columns', async () => {
    const database = await fixture();

    const rows = await database.manager
      .query()
      .selectFrom('fieldVisits')
      .selectAll()
      .execute();
    expect(rows).toEqual([]);

    await expect(
      database.manager
        .query()
        .insertInto('fieldVisits')
        .values({
          customerName: null,
          visitDate: '2026-09-01',
          conclusion: 'satisfied',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never)
        .execute(),
    ).rejects.toThrow();

    await database.close();
  });

  it('drops the table on rollback', async () => {
    const database = await fixture();

    const result = await database.migrator.rollback();
    expect(result.rolledBack).toContain('202609220001_create_field_visits');

    await expect(
      database.manager.query().selectFrom('fieldVisits').selectAll().execute(),
    ).rejects.toThrow();

    await database.close();
  });
});

describe('field visits seed', () => {
  it('does not insert duplicates when it runs again', async () => {
    const database = await fixture();
    const context = {
      query: database.manager.query(),
    } as unknown as SeedContext;

    await fieldVisitSeed.run(context);
    await fieldVisitSeed.run(context);

    const rows = await database.manager
      .query()
      .selectFrom('fieldVisits')
      .selectAll()
      .execute();
    expect(rows).toHaveLength(4);

    await database.close();
  });
});
