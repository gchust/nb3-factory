// @vitest-environment node
import path from 'node:path';

import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import type { DatabaseFilter } from '@nocobase/app-plugin-authorization/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { compileEquipmentFilter } from '../../server/providers/equipment.js';
import { createTempConfig, WORKSPACE_ROOT } from '../helpers/test-app.js';

let db: DatabaseManager;
let temp: ReturnType<typeof createTempConfig>;

const ROWS = [
  {
    name: 'Laptop A',
    assetNumber: 'F-0001',
    category: '电脑',
    status: 'available',
  },
  {
    name: 'Laptop B',
    assetNumber: 'F-0002',
    category: '电脑',
    status: 'borrowed',
  },
  {
    name: 'Projector C',
    assetNumber: 'F-0003',
    category: '投影',
    status: 'repairing',
  },
  {
    name: 'Projector D',
    assetNumber: 'F-0004',
    category: '投影',
    status: 'available',
  },
] as const;

beforeAll(async () => {
  temp = createTempConfig();
  db = createDatabaseManager({
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: temp.dbPath, debug: false },
    },
  });
  const migrator = createMigrator({
    database: { connection: (name) => db.connection(name ?? 'main') },
    connection: 'main',
    directory: path.join(WORKSPACE_ROOT, 'database/migrations'),
    packageName: 'app',
  });
  await migrator.latest();
  const now = new Date().toISOString();
  for (const row of ROWS) {
    await db
      .query()
      .insertInto('equipment')
      .values({ ...row, description: null, createdAt: now, updatedAt: now })
      .execute();
  }
});

afterAll(async () => {
  await db.destroy();
  temp.dispose();
});

async function filteredNames(filter: DatabaseFilter): Promise<string[]> {
  const compiled = compileEquipmentFilter(filter);
  const query = db.query().selectFrom('equipment').select(['name']);
  const rows =
    compiled === undefined
      ? await query.execute()
      : await query.where(compiled).execute();
  return rows.map((row) => String(row.name)).sort();
}

describe('compileEquipmentFilter', () => {
  it('returns undefined for an empty filter (full access)', () => {
    expect(compileEquipmentFilter({})).toBeUndefined();
    expect(compileEquipmentFilter({ $and: [] })).toBeUndefined();
    expect(compileEquipmentFilter({ $or: [] })).toBeUndefined();
  });

  it('applies a field equality condition', async () => {
    await expect(
      filteredNames({ $and: [{ status: { $eq: 'available' } }] }),
    ).resolves.toEqual(['Laptop A', 'Projector D']);
  });

  it('applies $ne and $in', async () => {
    await expect(
      filteredNames({ $and: [{ status: { $ne: 'available' } }] }),
    ).resolves.toEqual(['Laptop B', 'Projector C']);
    await expect(
      filteredNames({ $and: [{ category: { $in: ['投影', '电脑'] } }] }),
    ).resolves.toEqual(['Laptop A', 'Laptop B', 'Projector C', 'Projector D']);
    await expect(
      filteredNames({
        $and: [{ status: { $notIn: ['available', 'borrowed'] } }],
      }),
    ).resolves.toEqual(['Projector C']);
  });

  it('applies $or and combined logical nodes', async () => {
    await expect(
      filteredNames({
        $or: [
          { $and: [{ status: { $eq: 'borrowed' } }] },
          {
            $and: [{ category: { $eq: '投影' }, status: { $eq: 'repairing' } }],
          },
        ],
      }),
    ).resolves.toEqual(['Laptop B', 'Projector C']);
  });

  it('applies range operators', async () => {
    // id is deterministic: rows were inserted in order, so ids are 1..4.
    await expect(
      filteredNames({ $and: [{ id: { $gte: 2 } }, { id: { $lte: 3 } }] }),
    ).resolves.toEqual(['Laptop B', 'Projector C']);
  });
});
